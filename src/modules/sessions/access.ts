import { and, asc, eq, getTableColumns } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, session } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class SessionNotFoundError extends Error {}
export class SessionRevisionConflictError extends Error {}
export class InvalidSessionInputError extends Error {}

export type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
export const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(session) };
const join = and(eq(session.id, campaignEntity.id), eq(session.campaignId, campaignEntity.campaignId));

export function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(session).innerJoin(campaignEntity, join)
    .innerJoin(campaign, and(eq(campaign.id, session.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedSessions(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(session.campaignId, campaignId))
    .orderBy(asc(session.plannedFor), asc(campaignEntity.createdAt));
}
export async function getOwnedSession(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new SessionNotFoundError();
  const [row] = await owned(db, actor).where(eq(session.id, id));
  if (!row) throw new SessionNotFoundError();
  return row;
}

export async function lockSession(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new SessionNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "SESSION"),
      eq(campaign.ownerUserId, actor.userId))).for("update", { of: campaignEntity });
  if (!row) throw new SessionNotFoundError();
  const current = await getOwnedSession(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidSessionInputError();
  if (current.revision !== expectedRevision) throw new SessionRevisionConflictError();
  return current;
}
