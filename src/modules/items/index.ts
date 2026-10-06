import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, item, location, npc, playerCharacter } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class ItemNotFoundError extends Error {}
export class ItemRevisionConflictError extends Error {}
export class InvalidItemInputError extends Error {}

type Fields = { name: string; description?: string | null; significance?: string | null;
  currentState?: string | null; notes?: string | null; locationId?: string | null;
  npcHolderId?: string | null; playerCharacterHolderId?: string | null };
export type CreateItemInput = Fields & { campaignId: string };
export type EditItemInput = Fields & { expectedRevision: number };
type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(item) };
const identity = and(eq(item.id, campaignEntity.id), eq(item.campaignId, campaignEntity.campaignId));

function ownedItems(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(item).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, item.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedItems(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedItems(db, actor).where(eq(item.campaignId, campaignId));
}
export async function getOwnedItem(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new ItemNotFoundError();
  const [row] = await ownedItems(db, actor).where(eq(item.id, id));
  if (!row) throw new ItemNotFoundError();
  return row;
}
function validate(input: Fields) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0")) throw new InvalidItemInputError();
  for (const value of [input.description, input.significance, input.currentState, input.notes]) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.includes("\0"))) throw new InvalidItemInputError();
  }
  const locators = [input.locationId, input.npcHolderId, input.playerCharacterHolderId].filter(Boolean);
  if (locators.length > 1 || locators.some(value => !isUuid(value))) throw new InvalidItemInputError();
}
async function lockCampaign(tx: Transaction, actor: Actor, campaignId: string) {
  if (!isUuid(campaignId)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign).where(and(
    eq(campaign.id, campaignId), eq(campaign.ownerUserId, actor.userId),
  )).for("update");
  if (!row) throw new CampaignNotFoundError();
}
async function validateLocator(tx: Transaction, campaignId: string, input: Fields) {
  const selected = input.locationId ? { table: location, id: input.locationId }
    : input.npcHolderId ? { table: npc, id: input.npcHolderId }
    : input.playerCharacterHolderId ? { table: playerCharacter, id: input.playerCharacterHolderId } : null;
  if (!selected) return;
  const [row] = await tx.select({ id: selected.table.id }).from(selected.table)
    .innerJoin(campaignEntity, and(eq(selected.table.id, campaignEntity.id), eq(selected.table.campaignId, campaignEntity.campaignId)))
    .where(and(eq(selected.table.id, selected.id), eq(selected.table.campaignId, campaignId), sql`${campaignEntity.deletedAt} IS NULL`));
  if (!row) throw new InvalidItemInputError();
}
const values = (input: Fields) => ({ name: input.name.trim(), description: input.description ?? null,
  significance: input.significance ?? null, currentState: input.currentState ?? null, notes: input.notes ?? null,
  locationId: input.locationId || null, npcHolderId: input.npcHolderId || null,
  playerCharacterHolderId: input.playerCharacterHolderId || null });
export async function createItem(db: NodePgDatabase, actor: Actor, input: CreateItemInput) {
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    validate(input);
    await validateLocator(tx, input.campaignId, input);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "ITEM", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(item).values({ id: entity.id, campaignId: entity.campaignId, ...values(input) }).returning();
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}
async function lockItem(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new ItemNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "ITEM"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new ItemNotFoundError();
  const current = await getOwnedItem(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647) throw new InvalidItemInputError();
  if (current.revision !== expectedRevision) throw new ItemRevisionConflictError();
  return current;
}
const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };
export async function editItem(db: NodePgDatabase, actor: Actor, id: string, input: EditItemInput) {
  return db.transaction(async tx => {
    const current = await getOwnedItem(tx, actor, id);
    await lockCampaign(tx, actor, current.campaignId);
    const locked = await lockItem(tx, actor, id, input.expectedRevision);
    if (locked.deletedAt) throw new InvalidItemInputError();
    validate(input);
    await validateLocator(tx, locked.campaignId, input);
    const next = values(input);
    if (Object.entries(next).every(([key, value]) => locked[key as keyof typeof next] === value)) return locked;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(item).set(next).where(eq(item.id, id));
    return getOwnedItem(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockItem(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt) || (action === "trash" && current.deletedAt)
      || (action === "restore" && !current.deletedAt)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
      : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedItem(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveItem = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const trashItem = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreItem = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
