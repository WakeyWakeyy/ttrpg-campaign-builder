import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, clue, location } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class ClueNotFoundError extends Error {}
export class ClueRevisionConflictError extends Error {}
export class InvalidClueInputError extends Error {}

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
type Fields = { title: string; secret: string; discoveryLocationId: string | null };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(clue) };
const join = and(eq(clue.id, campaignEntity.id), eq(clue.campaignId, campaignEntity.campaignId));
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function validate(input: Fields) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200 || input.title.includes("\0")
    || typeof input.secret !== "string" || !input.secret.trim() || input.secret.length > 10000 || input.secret.includes("\0")
    || input.discoveryLocationId !== null && !uuid(input.discoveryLocationId)) throw new InvalidClueInputError();
  return { title: input.title.trim(), secret: input.secret.trim(), discoveryLocationId: input.discoveryLocationId };
}
async function validateLocation(tx: Transaction, campaignId: string, id: string | null) {
  if (!id) return;
  const [row] = await tx.select({ id: location.id }).from(location)
    .innerJoin(campaignEntity, and(eq(campaignEntity.id, location.id), eq(campaignEntity.campaignId, location.campaignId)))
    .where(and(eq(location.campaignId, campaignId), eq(location.id, id),
      sql`${campaignEntity.archivedAt} IS NULL AND ${campaignEntity.deletedAt} IS NULL`));
  if (!row) throw new InvalidClueInputError();
}
function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(clue).innerJoin(campaignEntity, join)
    .innerJoin(campaign, and(eq(campaign.id, clue.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedClues(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(clue.campaignId, campaignId)).orderBy(asc(campaignEntity.createdAt));
}
export async function getOwnedClue(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new ClueNotFoundError();
  const [row] = await owned(db, actor).where(eq(clue.id, id));
  if (!row) throw new ClueNotFoundError();
  return row;
}
export async function createClue(db: NodePgDatabase, actor: Actor, input: Fields & { campaignId: string }) {
  const data = validate(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    await validateLocation(tx, input.campaignId, data.discoveryLocationId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "CLUE", createdByUserId: actor.userId }).returning();
    await tx.insert(clue).values({ id: entity.id, campaignId: entity.campaignId, ...data });
    return getOwnedClue(tx, actor, entity.id);
  });
}
async function lock(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new ClueNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "CLUE"),
      eq(campaign.ownerUserId, actor.userId))).for("update", { of: campaignEntity });
  if (!row) throw new ClueNotFoundError();
  const current = await getOwnedClue(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidClueInputError();
  if (current.revision !== expectedRevision) throw new ClueRevisionConflictError();
  return current;
}
export async function editClue(db: NodePgDatabase, actor: Actor, id: string, input: Fields & { expectedRevision: number }) {
  const data = validate(input);
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, input.expectedRevision);
    if (current.deletedAt) throw new InvalidClueInputError();
    if (data.discoveryLocationId !== current.discoveryLocationId)
      await validateLocation(tx, current.campaignId, data.discoveryLocationId);
    if (current.title === data.title && current.secret === data.secret
      && current.discoveryLocationId === data.discoveryLocationId) return current;
    await tx.update(clue).set(data).where(eq(clue.id, id));
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return getOwnedClue(tx, actor, id);
  });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, revision: number,
  action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, revision);
    if (action === "archive" && current.archivedAt || action === "trash" && current.deletedAt
      || action === "restore" && !current.deletedAt) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
        : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advance, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedClue(tx, actor, id);
  });
}
export const archiveClue = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const trashClue = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreClue = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
