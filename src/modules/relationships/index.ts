import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, semanticRelationship } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class RelationshipNotFoundError extends Error {}
export class RelationshipRevisionConflictError extends Error {}
export class InvalidRelationshipInputError extends Error {}

type Fields = { sourceEntityId: string; targetEntityId: string; kind: string; description?: string | null };
export type CreateRelationshipInput = Fields & { campaignId: string };
export type EditRelationshipInput = Fields & { expectedRevision: number };
type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(semanticRelationship) };
const join = and(eq(semanticRelationship.id, campaignEntity.id),
  eq(semanticRelationship.campaignId, campaignEntity.campaignId));

function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(semanticRelationship).innerJoin(campaignEntity, join)
    .innerJoin(campaign, and(eq(campaign.id, semanticRelationship.campaignId),
      eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedRelationships(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(semanticRelationship.campaignId, campaignId));
}
export async function getOwnedRelationship(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new RelationshipNotFoundError();
  const [row] = await owned(db, actor).where(eq(semanticRelationship.id, id));
  if (!row) throw new RelationshipNotFoundError();
  return row;
}
function validate(input: Fields) {
  if (!uuid(input.sourceEntityId) || !uuid(input.targetEntityId)
    || input.sourceEntityId.toLowerCase() === input.targetEntityId.toLowerCase()
    || typeof input.kind !== "string" || !input.kind.trim() || input.kind.includes("\0")
    || (input.description !== undefined && input.description !== null
      && (typeof input.description !== "string" || input.description.includes("\0")))) {
    throw new InvalidRelationshipInputError();
  }
}
async function lockCampaign(tx: Transaction, actor: Actor, campaignId: string) {
  if (!uuid(campaignId)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.ownerUserId, actor.userId))).for("update");
  if (!row) throw new CampaignNotFoundError();
}
async function validateEndpoints(tx: Transaction, campaignId: string, input: Fields) {
  const rows = await tx.select({ id: campaignEntity.id }).from(campaignEntity).where(and(
    eq(campaignEntity.campaignId, campaignId),
    inArray(campaignEntity.id, [input.sourceEntityId, input.targetEntityId]),
    sql`${campaignEntity.deletedAt} IS NULL`,
    sql`${campaignEntity.entityType} <> 'RELATIONSHIP'`,
  )).for("share");
  if (rows.length !== 2) throw new InvalidRelationshipInputError();
}
export async function createRelationship(db: NodePgDatabase, actor: Actor, input: CreateRelationshipInput) {
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    validate(input);
    await validateEndpoints(tx, input.campaignId, input);
    const [entity] = await tx.insert(campaignEntity).values({
      campaignId: input.campaignId, entityType: "RELATIONSHIP", createdByUserId: actor.userId,
    }).returning();
    const [typed] = await tx.insert(semanticRelationship).values({
      id: entity.id, campaignId: entity.campaignId, sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId, kind: input.kind.trim(),
      description: input.description ?? null,
    }).returning();
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}
async function lockRelationship(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new RelationshipNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new RelationshipNotFoundError();
  const current = await getOwnedRelationship(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidRelationshipInputError();
  if (current.revision !== expectedRevision) throw new RelationshipRevisionConflictError();
  return current;
}
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };
export async function editRelationship(db: NodePgDatabase, actor: Actor, id: string, input: EditRelationshipInput) {
  return db.transaction(async tx => {
    const current = await getOwnedRelationship(tx, actor, id);
    await lockCampaign(tx, actor, current.campaignId);
    const locked = await lockRelationship(tx, actor, id, input.expectedRevision);
    if (locked.deletedAt) throw new InvalidRelationshipInputError();
    validate(input);
    await validateEndpoints(tx, locked.campaignId, input);
    const next = { sourceEntityId: input.sourceEntityId.toLowerCase(),
      targetEntityId: input.targetEntityId.toLowerCase(), kind: input.kind.trim(),
      description: input.description ?? null };
    if (Object.entries(next).every(([key, value]) => locked[key as keyof typeof next] === value)) return locked;
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    await tx.update(semanticRelationship).set(next).where(eq(semanticRelationship.id, id));
    return getOwnedRelationship(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, revision: number,
  action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockRelationship(tx, actor, id, revision);
    if ((action === "archive" && current.archivedAt) || (action === "trash" && current.deletedAt)
      || (action === "restore" && !current.deletedAt)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
      : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advance, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedRelationship(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveRelationship = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "archive");
export const trashRelationship = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "trash");
export const restoreRelationship = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "restore");
