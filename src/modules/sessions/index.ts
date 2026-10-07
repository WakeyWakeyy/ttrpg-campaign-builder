import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, session } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class SessionNotFoundError extends Error {}
export class SessionRevisionConflictError extends Error {}
export class InvalidSessionInputError extends Error {}

type Fields = { title: string; plannedFor?: string | null; preparation?: string | null; outcome?: string | null };
type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(session) };
const join = and(eq(session.id, campaignEntity.id), eq(session.campaignId, campaignEntity.campaignId));
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function owned(db: NodePgDatabase, actor: Actor) {
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
function values(input: Fields) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.includes("\0")
    || [input.preparation, input.outcome].some(value => value != null && (typeof value !== "string" || value.includes("\0"))))
    throw new InvalidSessionInputError();
  if (input.plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(input.plannedFor)) throw new InvalidSessionInputError();
  if (input.plannedFor) {
    const date = new Date(`${input.plannedFor}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.plannedFor)
      throw new InvalidSessionInputError();
  }
  return { title: input.title.trim(), plannedFor: input.plannedFor || null,
    preparation: input.preparation || null, outcome: input.outcome || null };
}
export async function createSession(db: NodePgDatabase, actor: Actor, input: Fields & { campaignId: string }) {
  if (!uuid(input.campaignId)) throw new InvalidSessionInputError();
  const data = values(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "SESSION", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(session).values({ id: entity.id, campaignId: entity.campaignId, ...data }).returning();
    return { ...entity, ...typed };
  });
}
async function lock(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
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
export async function editSession(db: NodePgDatabase, actor: Actor, id: string, input: Fields & { expectedRevision: number }) {
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, input.expectedRevision);
    if (current.deletedAt) throw new InvalidSessionInputError();
    const data = values(input);
    if (current.title === data.title && current.plannedFor === data.plannedFor
      && current.preparation === data.preparation && current.outcome === data.outcome) return current;
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    await tx.update(session).set(data).where(eq(session.id, id));
    return getOwnedSession(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, revision: number,
  action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, revision);
    if ((action === "archive" && current.archivedAt) || (action === "trash" && current.deletedAt)
      || (action === "restore" && !current.deletedAt)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
      : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advance, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedSession(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveSession = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "archive");
export const trashSession = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "trash");
export const restoreSession = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "restore");
