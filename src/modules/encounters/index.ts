import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, encounter, encounterCreature, encounterSrdPlan } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { getCampaignRulesetVersion } from "../rulesets";
import { calculateEncounterBudget } from "../rulesets/encounter-budget";
export { EncounterPlacementNotFoundError, listSessionEncounterPlacements, placeEncounter,
  removeEncounterPlacement } from "./placements";

export class EncounterNotFoundError extends Error {}
export class EncounterCreatureNotFoundError extends Error {}
export class EncounterRevisionConflictError extends Error {}
export class InvalidEncounterInputError extends Error {}
export class UnsupportedEncounterVersionError extends Error {}

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
type Fields = { title: string; notes?: string | null; partyLevel: number; partySize: number };
type CreatureFields = { name: string; xp: number; quantity: number };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(encounter),
  partyLevel: encounterSrdPlan.partyLevel, partySize: encounterSrdPlan.partySize };
const join = and(eq(encounter.id, campaignEntity.id), eq(encounter.campaignId, campaignEntity.campaignId));
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(encounter).innerJoin(campaignEntity, join)
    .innerJoin(encounterSrdPlan, eq(encounterSrdPlan.encounterId, encounter.id))
    .innerJoin(campaign, and(eq(campaign.id, encounter.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedEncounters(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(encounter.campaignId, campaignId)).orderBy(asc(campaignEntity.createdAt));
}
export async function getOwnedEncounter(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new EncounterNotFoundError();
  const [row] = await owned(db, actor).where(eq(encounter.id, id));
  if (!row) throw new EncounterNotFoundError();
  return row;
}
export async function listEncounterCreatures(db: NodePgDatabase, actor: Actor, id: string) {
  const parent = await getOwnedEncounter(db, actor, id);
  return db.select().from(encounterCreature).where(and(eq(encounterCreature.encounterId, id),
    eq(encounterCreature.campaignId, parent.campaignId))).orderBy(asc(encounterCreature.id));
}
function validate(input: Fields) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.includes("\0")
    || input.title.length > 200 || input.notes != null && (typeof input.notes !== "string" || input.notes.includes("\0")))
    throw new InvalidEncounterInputError();
  try { calculateEncounterBudget({ rulesetKey: "dnd-5e-2024", version: "5.2.1",
    partyLevel: input.partyLevel, partySize: input.partySize, creatureXp: [] }); }
  catch { throw new InvalidEncounterInputError(); }
  return { title: input.title.trim(), notes: input.notes || null,
    partyLevel: input.partyLevel, partySize: input.partySize };
}
function validateCreature(input: CreatureFields) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0")
    || input.name.length > 200 || !Number.isInteger(input.xp) || input.xp < 0 || input.xp > 2147483647
    || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100)
    throw new InvalidEncounterInputError();
  return { name: input.name.trim(), xp: input.xp, quantity: input.quantity };
}
async function requireSupportedVersion(tx: Transaction, actor: Actor, campaignId: string) {
  const pin = await getCampaignRulesetVersion(tx, actor, campaignId);
  if (pin?.rulesetKey !== "dnd-5e-2024" || pin.version !== "5.2.1")
    throw new UnsupportedEncounterVersionError();
}
export async function createEncounter(db: NodePgDatabase, actor: Actor, input: Fields & { campaignId: string }) {
  const data = validate(input);
  return db.transaction(async tx => {
    await requireSupportedVersion(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "ENCOUNTER", createdByUserId: actor.userId }).returning();
    await tx.insert(encounter).values({ id: entity.id, campaignId: entity.campaignId,
      title: data.title, notes: data.notes });
    await tx.insert(encounterSrdPlan).values({ encounterId: entity.id, campaignId: entity.campaignId,
      partyLevel: data.partyLevel, partySize: data.partySize });
    return getOwnedEncounter(tx, actor, entity.id);
  }, { isolationLevel: "read committed" });
}
async function lock(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new EncounterNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "ENCOUNTER"),
      eq(campaign.ownerUserId, actor.userId))).for("update", { of: campaignEntity });
  if (!row) throw new EncounterNotFoundError();
  const current = await getOwnedEncounter(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidEncounterInputError();
  if (current.revision !== expectedRevision) throw new EncounterRevisionConflictError();
  return current;
}
export async function editEncounter(db: NodePgDatabase, actor: Actor, id: string,
  input: Fields & { expectedRevision: number }) {
  const data = validate(input);
  return db.transaction(async tx => {
    const current = await lock(tx, actor, id, input.expectedRevision);
    if (current.deletedAt) throw new InvalidEncounterInputError();
    if (current.title === data.title && current.notes === data.notes && current.partyLevel === data.partyLevel
      && current.partySize === data.partySize) return current;
    await tx.update(encounter).set({ title: data.title, notes: data.notes }).where(eq(encounter.id, id));
    await tx.update(encounterSrdPlan).set({ partyLevel: data.partyLevel, partySize: data.partySize })
      .where(eq(encounterSrdPlan.encounterId, id));
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return getOwnedEncounter(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export async function addEncounterCreature(db: NodePgDatabase, actor: Actor, id: string,
  input: CreatureFields & { expectedRevision: number }) {
  const data = validateCreature(input);
  return db.transaction(async tx => {
    const parent = await lock(tx, actor, id, input.expectedRevision);
    if (parent.deletedAt) throw new InvalidEncounterInputError();
    const [created] = await tx.insert(encounterCreature).values({ campaignId: parent.campaignId,
      encounterId: id, ...data }).returning();
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return created;
  }, { isolationLevel: "read committed" });
}
export async function editEncounterCreature(db: NodePgDatabase, actor: Actor, id: string, creatureId: string,
  input: CreatureFields & { expectedRevision: number; intent: "save" | "trash" | "restore" }) {
  if (!uuid(creatureId)) throw new EncounterCreatureNotFoundError();
  const data = input.intent === "save" ? validateCreature(input) : null;
  return db.transaction(async tx => {
    const parent = await lock(tx, actor, id, input.expectedRevision);
    const [current] = await tx.select().from(encounterCreature).where(and(eq(encounterCreature.id, creatureId),
      eq(encounterCreature.encounterId, id), eq(encounterCreature.campaignId, parent.campaignId)));
    if (!current) throw new EncounterCreatureNotFoundError();
    if (parent.deletedAt || input.intent === "save" && current.deletedAt) throw new InvalidEncounterInputError();
    if (input.intent === "trash" && current.deletedAt || input.intent === "restore" && !current.deletedAt
      || input.intent === "save" && current.name === data!.name && current.xp === data!.xp
      && current.quantity === data!.quantity) return current;
    const change = input.intent === "save" ? data! : input.intent === "trash"
      ? { deletedAt: sql`statement_timestamp()` } : { deletedAt: null };
    const [updated] = await tx.update(encounterCreature).set(change).where(eq(encounterCreature.id, creatureId)).returning();
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    return updated;
  }, { isolationLevel: "read committed" });
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
    return getOwnedEncounter(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveEncounter = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "archive");
export const trashEncounter = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "trash");
export const restoreEncounter = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "restore");
