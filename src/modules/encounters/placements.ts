import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaignEntity, encounter, encounterPlacement, scene } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";
import { getOwnedSession, InvalidSessionInputError, lockSession, uuid,
  type Transaction } from "../sessions/access";

export class EncounterPlacementNotFoundError extends Error {}
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

export async function listSessionEncounterPlacements(db: NodePgDatabase, actor: Actor, sessionId: string) {
  const parent = await getOwnedSession(db, actor, sessionId);
  return db.select({ id: encounterPlacement.id, sceneId: encounterPlacement.sceneId,
    encounterId: encounterPlacement.encounterId, title: encounter.title,
    encounterDeletedAt: campaignEntity.deletedAt, sceneDeletedAt: scene.deletedAt }).from(encounterPlacement)
    .innerJoin(encounter, eq(encounter.id, encounterPlacement.encounterId))
    .innerJoin(campaignEntity, eq(campaignEntity.id, encounter.id))
    .leftJoin(scene, eq(scene.id, encounterPlacement.sceneId))
    .where(and(eq(encounterPlacement.sessionId, sessionId), eq(encounterPlacement.campaignId, parent.campaignId)))
    .orderBy(asc(encounterPlacement.createdAt), asc(encounterPlacement.id));
}

export async function placeEncounter(db: NodePgDatabase, actor: Actor, sessionId: string,
  input: { expectedRevision: number; encounterId: string; sceneId?: string | null }) {
  if (!uuid(input.encounterId) || input.sceneId && !uuid(input.sceneId)) throw new InvalidSessionInputError();
  return db.transaction(async tx => {
    const parent = await lockSession(tx, actor, sessionId, input.expectedRevision);
    if (parent.deletedAt) throw new InvalidSessionInputError();
    const [definition] = await tx.select({ id: encounter.id }).from(encounter)
      .innerJoin(campaignEntity, eq(campaignEntity.id, encounter.id))
      .where(and(eq(encounter.id, input.encounterId), eq(encounter.campaignId, parent.campaignId),
        isNull(campaignEntity.deletedAt))).for("share", { of: campaignEntity });
    if (!definition) throw new InvalidSessionInputError();
    if (input.sceneId) {
      const [target] = await tx.select({ id: scene.id }).from(scene).where(and(eq(scene.id, input.sceneId),
        eq(scene.sessionId, sessionId), eq(scene.campaignId, parent.campaignId), isNull(scene.deletedAt)))
        .for("share");
      if (!target) throw new InvalidSessionInputError();
    }
    const [placed] = await tx.insert(encounterPlacement).values({ campaignId: parent.campaignId,
      sessionId, sceneId: input.sceneId || null, encounterId: input.encounterId }).returning();
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, sessionId));
    return placed;
  }, { isolationLevel: "read committed" });
}

export async function removeEncounterPlacement(db: NodePgDatabase, actor: Actor, sessionId: string,
  placementId: string, expectedRevision: number) {
  if (!uuid(placementId)) throw new EncounterPlacementNotFoundError();
  return db.transaction(async tx => {
    const parent = await lockSession(tx, actor, sessionId, expectedRevision);
    if (parent.deletedAt) throw new InvalidSessionInputError();
    const [removed] = await tx.delete(encounterPlacement).where(and(eq(encounterPlacement.id, placementId),
      eq(encounterPlacement.sessionId, sessionId), eq(encounterPlacement.campaignId, parent.campaignId))).returning();
    if (!removed) throw new EncounterPlacementNotFoundError();
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, sessionId));
    return removed;
  }, { isolationLevel: "read committed" });
}

// The Session copy owns the transaction; this helper only copies Encounter-owned links.
export async function copyEncounterPlacements(tx: Transaction, campaignId: string, sourceId: string,
  targetId: string, sceneIds: Map<string, string>) {
  const placements = await tx.select().from(encounterPlacement)
    .where(and(eq(encounterPlacement.campaignId, campaignId), eq(encounterPlacement.sessionId, sourceId)));
  const available = placements.filter(placement => !placement.sceneId || sceneIds.has(placement.sceneId));
  if (available.length) await tx.insert(encounterPlacement).values(available.map(placement => ({
    campaignId, sessionId: targetId, sceneId: placement.sceneId ? sceneIds.get(placement.sceneId) : null,
    encounterId: placement.encounterId,
  })));
}
