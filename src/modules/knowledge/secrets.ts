import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, secret } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class SecretNotFoundError extends Error {}
export class SecretRevisionConflictError extends Error {}
export class InvalidSecretInputError extends Error {}

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
type Fields = { title: string; content: string };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(secret) };
const join = and(eq(secret.id, campaignEntity.id), eq(secret.campaignId, campaignEntity.campaignId));
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function validate(input: Fields) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200 || input.title.includes("\0")
    || typeof input.content !== "string" || !input.content.trim() || input.content.length > 10000 || input.content.includes("\0"))
    throw new InvalidSecretInputError();
  return { title: input.title.trim(), content: input.content.trim() };
}
function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(secret).innerJoin(campaignEntity, join)
    .innerJoin(campaign, and(eq(campaign.id, secret.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedSecrets(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(secret.campaignId, campaignId)).orderBy(asc(campaignEntity.createdAt));
}
export async function getOwnedSecret(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new SecretNotFoundError();
  const [row] = await owned(db, actor).where(eq(secret.id, id));
  if (!row) throw new SecretNotFoundError();
  return row;
}
export async function createSecret(db: NodePgDatabase, actor: Actor, input: Fields & { campaignId: string }) {
  const data = validate(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "SECRET", createdByUserId: actor.userId }).returning();
    await tx.insert(secret).values({ id: entity.id, campaignId: entity.campaignId, ...data });
    return getOwnedSecret(tx, actor, entity.id);
  });
}
async function lock(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new SecretNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "SECRET"),
      eq(campaign.ownerUserId, actor.userId))).for("update", { of: campaignEntity });
  if (!row) throw new SecretNotFoundError();
  const current = await getOwnedSecret(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidSecretInputError();
  if (current.revision !== expectedRevision) throw new SecretRevisionConflictError();
  return current;
}
export async function editSecret(db: NodePgDatabase, actor: Actor, id: string, input: Fields & { expectedRevision: number }) {
  const data = validate(input);
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, input.expectedRevision);
    if (current.deletedAt) throw new InvalidSecretInputError();
    if (current.title === data.title && current.content === data.content) return current;
    await tx.update(secret).set(data).where(eq(secret.id, id));
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return getOwnedSecret(tx, actor, id);
  });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, revision: number,
  action: "archive" | "unarchive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, revision);
    if (action === "archive" && (current.archivedAt || current.deletedAt)
      || action === "unarchive" && (!current.archivedAt || current.deletedAt)
      || action === "trash" && current.deletedAt
      || action === "restore" && !current.deletedAt) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "unarchive" ? { archivedAt: null }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
        : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advance, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedSecret(tx, actor, id);
  });
}
export const archiveSecret = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const unarchiveSecret = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "unarchive");
export const trashSecret = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreSecret = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
