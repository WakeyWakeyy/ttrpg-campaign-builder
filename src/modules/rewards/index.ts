import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, reward, rewardComponent } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class RewardNotFoundError extends Error {}
export class RewardComponentNotFoundError extends Error {}
export class RewardRevisionConflictError extends Error {}
export class InvalidRewardInputError extends Error {}

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
export const rewardKinds = ["MONEY", "ITEM", "INFORMATION", "REPUTATION", "FAVOR", "ACCESS", "PROGRESSION", "OTHER"] as const;
export type RewardKind = typeof rewardKinds[number];
type Fields = { title: string; notes?: string | null };
type ComponentFields = { kind: RewardKind; description: string };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(reward) };
const join = and(eq(reward.id, campaignEntity.id), eq(reward.campaignId, campaignEntity.campaignId));
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function validate(input: Fields) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200
    || input.title.includes("\0") || input.notes != null
      && (typeof input.notes !== "string" || input.notes.length > 10000 || input.notes.includes("\0")))
    throw new InvalidRewardInputError();
  return { title: input.title.trim(), notes: input.notes?.trim() || null };
}
function validateComponent(input: ComponentFields) {
  if (!rewardKinds.includes(input.kind) || typeof input.description !== "string"
    || !input.description.trim() || input.description.length > 1000 || input.description.includes("\0"))
    throw new InvalidRewardInputError();
  return { kind: input.kind, description: input.description.trim() };
}
function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(reward).innerJoin(campaignEntity, join)
    .innerJoin(campaign, and(eq(campaign.id, reward.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedRewards(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(reward.campaignId, campaignId)).orderBy(asc(campaignEntity.createdAt));
}
export async function getOwnedReward(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new RewardNotFoundError();
  const [row] = await owned(db, actor).where(eq(reward.id, id));
  if (!row) throw new RewardNotFoundError();
  return row;
}
export async function listRewardComponents(db: NodePgDatabase, actor: Actor, id: string) {
  const parent = await getOwnedReward(db, actor, id);
  return db.select().from(rewardComponent).where(and(eq(rewardComponent.rewardId, id),
    eq(rewardComponent.campaignId, parent.campaignId))).orderBy(asc(rewardComponent.id));
}
export async function createReward(db: NodePgDatabase, actor: Actor, input: Fields & { campaignId: string }) {
  const data = validate(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "REWARD", createdByUserId: actor.userId }).returning();
    await tx.insert(reward).values({ id: entity.id, campaignId: entity.campaignId, ...data });
    return getOwnedReward(tx, actor, entity.id);
  });
}
async function lock(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new RewardNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "REWARD"),
      eq(campaign.ownerUserId, actor.userId))).for("update", { of: campaignEntity });
  if (!row) throw new RewardNotFoundError();
  const current = await getOwnedReward(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidRewardInputError();
  if (current.revision !== expectedRevision) throw new RewardRevisionConflictError();
  return current;
}
export async function editReward(db: NodePgDatabase, actor: Actor, id: string,
  input: Fields & { expectedRevision: number }) {
  const data = validate(input);
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, input.expectedRevision);
    if (current.deletedAt) throw new InvalidRewardInputError();
    if (current.title === data.title && current.notes === data.notes) return current;
    await tx.update(reward).set(data).where(eq(reward.id, id));
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return getOwnedReward(tx, actor, id);
  });
}
export async function addRewardComponent(db: NodePgDatabase, actor: Actor, id: string,
  input: ComponentFields & { expectedRevision: number }) {
  const data = validateComponent(input);
  return db.transaction(async tx => {
    const parent = await lock(tx, actor, id, input.expectedRevision);
    if (parent.deletedAt) throw new InvalidRewardInputError();
    const [created] = await tx.insert(rewardComponent).values({ campaignId: parent.campaignId,
      rewardId: id, ...data }).returning();
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return created;
  });
}
export async function editRewardComponent(db: NodePgDatabase, actor: Actor, id: string, componentId: string,
  input: ComponentFields & { expectedRevision: number; intent: "save" | "trash" | "restore" }) {
  if (!uuid(componentId)) throw new RewardComponentNotFoundError();
  const data = input.intent === "save" ? validateComponent(input) : null;
  return db.transaction(async tx => {
    const parent = await lock(tx, actor, id, input.expectedRevision);
    const [current] = await tx.select().from(rewardComponent).where(and(eq(rewardComponent.id, componentId),
      eq(rewardComponent.rewardId, id), eq(rewardComponent.campaignId, parent.campaignId)));
    if (!current) throw new RewardComponentNotFoundError();
    if (parent.deletedAt || input.intent === "save" && current.deletedAt) throw new InvalidRewardInputError();
    if (input.intent === "trash" && current.deletedAt || input.intent === "restore" && !current.deletedAt
      || input.intent === "save" && current.kind === data!.kind && current.description === data!.description) return current;
    const change = input.intent === "save" ? data! : input.intent === "trash"
      ? { deletedAt: sql`statement_timestamp()` } : { deletedAt: null };
    const [updated] = await tx.update(rewardComponent).set(change).where(eq(rewardComponent.id, componentId)).returning();
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return updated;
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
    return getOwnedReward(tx, actor, id);
  });
}
export const archiveReward = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "archive");
export const trashReward = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "trash");
export const restoreReward = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "restore");
