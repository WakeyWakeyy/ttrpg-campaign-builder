import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaignEntity, rewardComponent, rewardGrant, rewardGrantComponent } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { getOwnedSession } from "../sessions";
import { getOwnedReward, RewardNotFoundError, RewardRevisionConflictError } from "./index";

export class InvalidRewardGrantInputError extends Error {}
export class RewardGrantIdempotencyConflictError extends Error {}

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function listRewardGrants(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  const grants = await db.select().from(rewardGrant).where(eq(rewardGrant.campaignId, campaignId))
    .orderBy(asc(rewardGrant.grantedAt), asc(rewardGrant.id));
  if (!grants.length) return [];
  const components = await db.select().from(rewardGrantComponent)
    .where(inArray(rewardGrantComponent.grantId, grants.map(grant => grant.id)))
    .orderBy(asc(rewardGrantComponent.id));
  return grants.map(grant => ({ ...grant, components: components.filter(component => component.grantId === grant.id) }));
}

export async function recordRewardGrant(db: NodePgDatabase, actor: Actor, rewardId: string, input: {
  requestKey: string; expectedRevision: number; componentIds: string[]; recipient: string;
  notes?: string | null; sessionId?: string | null;
}) {
  if (!uuid(rewardId) || !uuid(input.requestKey) || !Array.isArray(input.componentIds)
    || !input.componentIds.length || input.componentIds.length > 100
    || input.componentIds.some(id => !uuid(id)) || new Set(input.componentIds).size !== input.componentIds.length
    || typeof input.recipient !== "string" || !input.recipient.trim() || input.recipient.length > 200
    || input.recipient.includes("\0") || input.notes != null && (typeof input.notes !== "string"
      || input.notes.length > 10000 || input.notes.includes("\0"))
    || input.sessionId && !uuid(input.sessionId)) throw new InvalidRewardGrantInputError();
  const requestHash = createHash("sha256").update(JSON.stringify({ rewardId,
    componentIds: [...input.componentIds].sort(), recipient: input.recipient.trim(),
    notes: input.notes?.trim() || null, sessionId: input.sessionId || null })).digest("hex");
  return db.transaction(async tx => {
    const source = await getOwnedReward(tx, actor, rewardId);
    const [locked] = await tx.select({ revision: campaignEntity.revision, deletedAt: campaignEntity.deletedAt })
      .from(campaignEntity).where(eq(campaignEntity.id, rewardId)).for("update");
    if (!locked) throw new RewardNotFoundError();
    const [previous] = await tx.select().from(rewardGrant).where(and(
      eq(rewardGrant.campaignId, source.campaignId), eq(rewardGrant.requestKey, input.requestKey)));
    if (previous) {
      if (previous.requestHash !== requestHash) throw new RewardGrantIdempotencyConflictError();
      return previous;
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
      || locked.revision !== input.expectedRevision) throw new RewardRevisionConflictError();
    if (locked.deletedAt) throw new InvalidRewardGrantInputError();
    if (input.sessionId) {
      const chosenSession = await getOwnedSession(tx, actor, input.sessionId);
      if (chosenSession.campaignId !== source.campaignId || chosenSession.deletedAt)
        throw new InvalidRewardGrantInputError();
    }
    const chosen = await tx.select().from(rewardComponent).where(and(
      eq(rewardComponent.campaignId, source.campaignId), eq(rewardComponent.rewardId, rewardId),
      inArray(rewardComponent.id, input.componentIds)));
    if (chosen.length !== input.componentIds.length || chosen.some(component => component.deletedAt))
      throw new InvalidRewardGrantInputError();
    const [grant] = await tx.insert(rewardGrant).values({ campaignId: source.campaignId,
      requestKey: input.requestKey, requestHash, sourceCampaignId: source.campaignId, rewardId,
      sessionCampaignId: input.sessionId ? source.campaignId : null, sessionId: input.sessionId || null,
      rewardTitle: source.title, recipient: input.recipient.trim(), notes: input.notes?.trim() || null })
      .returning();
    await tx.insert(rewardGrantComponent).values(chosen.map(component => ({ grantId: grant.id,
      kind: component.kind, description: component.description })));
    await tx.update(campaignEntity).set({ revision: sql`${campaignEntity.revision} + 1`,
      updatedAt: sql`clock_timestamp()` }).where(eq(campaignEntity.id, rewardId));
    return grant;
  });
}
