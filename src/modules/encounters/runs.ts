import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaignEntity, encounter, encounterCreature, encounterPlacement, encounterRun,
  encounterRunCreature, scene } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";
import { getOwnedSession, InvalidSessionInputError, lockSession, uuid } from "../sessions/access";

export class InvalidEncounterRunInputError extends Error {}

export async function listSessionEncounterRuns(db: NodePgDatabase, actor: Actor, sessionId: string) {
  await getOwnedSession(db, actor, sessionId);
  const runs = await db.select().from(encounterRun).where(eq(encounterRun.sessionId, sessionId))
    .orderBy(asc(encounterRun.occurredAt), asc(encounterRun.id));
  const creatures = await Promise.all(runs.map(run => db.select().from(encounterRunCreature)
    .where(eq(encounterRunCreature.runId, run.id)).orderBy(asc(encounterRunCreature.id))));
  return runs.map((run, index) => ({ ...run, creatures: creatures[index] }));
}

export async function recordEncounterRun(db: NodePgDatabase, actor: Actor, sessionId: string,
  input: { expectedRevision: number; placementId?: string | null; title?: string; outcome: string }) {
  if (typeof input.outcome !== "string" || !input.outcome.trim() || input.outcome.includes("\0")
    || input.outcome.length > 10000 || input.placementId && !uuid(input.placementId)
    || !input.placementId && (typeof input.title !== "string" || !input.title.trim()
      || input.title.length > 200 || input.title.includes("\0"))) throw new InvalidEncounterRunInputError();
  return db.transaction(async tx => {
    const parent = await lockSession(tx, actor, sessionId, input.expectedRevision);
    if (parent.deletedAt) throw new InvalidSessionInputError();
    let source: { encounterId: string; title: string } | null = null;
    if (input.placementId) {
      const [placement] = await tx.select({ encounterId: encounter.id, title: encounter.title,
        sceneId: encounterPlacement.sceneId, sceneDeletedAt: scene.deletedAt })
        .from(encounterPlacement)
        .innerJoin(encounter, eq(encounter.id, encounterPlacement.encounterId))
        .innerJoin(campaignEntity, eq(campaignEntity.id, encounter.id))
        .leftJoin(scene, eq(scene.id, encounterPlacement.sceneId))
        .where(and(eq(encounterPlacement.id, input.placementId),
          eq(encounterPlacement.sessionId, sessionId), eq(encounterPlacement.campaignId, parent.campaignId),
          isNull(campaignEntity.deletedAt))).for("share", { of: [encounterPlacement, campaignEntity] });
      if (!placement || placement.sceneId && placement.sceneDeletedAt) throw new InvalidEncounterRunInputError();
      source = placement;
    }
    const [run] = await tx.insert(encounterRun).values({ campaignId: parent.campaignId, sessionId,
      sourceCampaignId: source ? parent.campaignId : null, sourceSessionId: source ? sessionId : null,
      placementId: input.placementId || null, encounterId: source?.encounterId || null,
      title: source?.title || input.title!.trim(), outcome: input.outcome.trim() }).returning();
    if (source) {
      const creatures = await tx.select({ name: encounterCreature.name, xp: encounterCreature.xp,
        quantity: encounterCreature.quantity }).from(encounterCreature)
        .where(and(eq(encounterCreature.encounterId, source.encounterId), isNull(encounterCreature.deletedAt)));
      if (creatures.length) await tx.insert(encounterRunCreature).values(creatures.map(creature =>
        ({ runId: run.id, ...creature })));
    }
    await tx.update(campaignEntity).set({ revision: sql`${campaignEntity.revision} + 1`,
      updatedAt: sql`clock_timestamp()` }).where(eq(campaignEntity.id, sessionId));
    return run;
  }, { isolationLevel: "read committed" });
}
