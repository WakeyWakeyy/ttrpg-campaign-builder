import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { arc, arcQuest, campaign, campaignEntity, quest } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { InvalidQuestArcError, InvalidQuestInputError, InvalidQuestParentError, QuestNotFoundError, QuestRevisionConflictError } from "./errors";

export * from "./errors";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
export type QuestStatus = "OPEN" | "RESOLVED" | "FAILED" | "POSTPONED" | "ABANDONED";
type Fields = { name?: string; description?: string | null; status?: QuestStatus; parentQuestId?: string | null; arcIds?: string[] };
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(quest) };
const identity = and(eq(quest.id, campaignEntity.id), eq(quest.campaignId, campaignEntity.campaignId));
const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function ownedQuests(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(quest).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, quest.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedQuests(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedQuests(db, actor).where(eq(quest.campaignId, campaignId));
}
export async function getOwnedQuest(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new QuestNotFoundError();
  const [row] = await ownedQuests(db, actor).where(eq(quest.id, id));
  if (!row) throw new QuestNotFoundError();
  return row;
}
export async function listQuestArcIds(db: NodePgDatabase, actor: Actor, id: string) {
  await getOwnedQuest(db, actor, id);
  return (await db.select({ arcId: arcQuest.arcId }).from(arcQuest).where(eq(arcQuest.questId, id))).map(row => row.arcId);
}
async function lockCampaign(tx: Transaction, actor: Actor, id: string) {
  if (!isUuid(id)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign)
    .where(and(eq(campaign.id, id), eq(campaign.ownerUserId, actor.userId))).for("update");
  if (!row) throw new CampaignNotFoundError();
}
function validateFields(input: Fields) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) throw new InvalidQuestInputError();
  if (input.description !== undefined && input.description !== null && (typeof input.description !== "string" || input.description.includes("\0"))) throw new InvalidQuestInputError();
  if (input.status !== undefined && !["OPEN", "RESOLVED", "FAILED", "POSTPONED", "ABANDONED"].includes(input.status)) throw new InvalidQuestInputError();
  if (input.arcIds !== undefined && (!Array.isArray(input.arcIds) || input.arcIds.some(id => !isUuid(id)) || new Set(input.arcIds.map(id => id.toLowerCase())).size !== input.arcIds.length)) throw new InvalidQuestArcError();
}
async function validateLinks(tx: Transaction, campaignId: string, input: Fields, childId?: string) {
  if (input.parentQuestId != null) {
    if (!isUuid(input.parentQuestId)) throw new InvalidQuestParentError();
    const [parent] = await tx.select({ id: quest.id }).from(quest).where(and(eq(quest.id, input.parentQuestId), eq(quest.campaignId, campaignId)));
    if (!parent) throw new InvalidQuestParentError();
    if (childId) {
      const ancestors = await tx.execute(sql`WITH RECURSIVE ancestors AS (
        SELECT id, parent_quest_id FROM quest WHERE campaign_id = ${campaignId} AND id = ${input.parentQuestId}
        UNION SELECT q.id, q.parent_quest_id FROM quest q JOIN ancestors a ON q.id = a.parent_quest_id WHERE q.campaign_id = ${campaignId}
      ) SELECT id FROM ancestors WHERE id = ${childId}`);
      if (ancestors.rows.length) throw new InvalidQuestParentError();
    }
  }
  for (const id of input.arcIds ?? []) {
    const [found] = await tx.select({ id: arc.id }).from(arc).where(and(eq(arc.id, id), eq(arc.campaignId, campaignId)));
    if (!found) throw new InvalidQuestArcError();
  }
}
export async function createQuest(db: NodePgDatabase, actor: Actor, input: Readonly<Fields & { campaignId: string; name: string }>) {
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    validateFields(input);
    await validateLinks(tx, input.campaignId, input);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId, entityType: "QUEST", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(quest).values({ id: entity.id, campaignId: entity.campaignId, name: input.name,
      description: input.description, status: input.status, parentQuestId: input.parentQuestId }).returning();
    if (input.arcIds?.length) await tx.insert(arcQuest).values(input.arcIds.map(arcId => ({ campaignId: entity.campaignId, arcId, questId: entity.id })));
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}
async function lockQuest(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new QuestNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "QUEST"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!row) throw new QuestNotFoundError();
  const current = await getOwnedQuest(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) throw new InvalidQuestInputError();
  if (current.revision !== expectedRevision) throw new QuestRevisionConflictError();
  return current;
}
export async function editQuest(db: NodePgDatabase, actor: Actor, id: string, input: Readonly<Fields & { expectedRevision: number }>) {
  return db.transaction(async tx => {
    // Serialize hierarchy and membership edits in a Campaign before locking the Quest.
    const owned = await getOwnedQuest(tx, actor, id);
    await lockCampaign(tx, actor, owned.campaignId);
    const current = await lockQuest(tx, actor, id, input.expectedRevision);
    validateFields(input);
    await validateLinks(tx, current.campaignId, input, id);
    const next = { name: input.name ?? current.name, description: input.description === undefined ? current.description : input.description,
      status: input.status ?? current.status, parentQuestId: input.parentQuestId === undefined ? current.parentQuestId : input.parentQuestId?.toLowerCase() ?? null };
    const previousArcs = input.arcIds === undefined ? [] : await tx.select({ arcId: arcQuest.arcId }).from(arcQuest).where(eq(arcQuest.questId, id));
    const newArcs = input.arcIds?.map(value => value.toLowerCase()).sort();
    const arcsChanged = newArcs !== undefined && JSON.stringify(previousArcs.map(row => row.arcId).sort()) !== JSON.stringify(newArcs);
    if (next.name === current.name && next.description === current.description && next.status === current.status
      && next.parentQuestId === current.parentQuestId && !arcsChanged) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(quest).set(next).where(eq(quest.id, id));
    if (arcsChanged) {
      await tx.delete(arcQuest).where(eq(arcQuest.questId, id));
      if (newArcs!.length) await tx.insert(arcQuest).values(newArcs!.map(arcId => ({ campaignId: current.campaignId, arcId, questId: id })));
    }
    return getOwnedQuest(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockQuest(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt !== null) || (action === "trash" && current.deletedAt !== null)
      || (action === "restore" && current.deletedAt === null)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`, purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
        : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedQuest(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveQuest = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const trashQuest = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreQuest = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
