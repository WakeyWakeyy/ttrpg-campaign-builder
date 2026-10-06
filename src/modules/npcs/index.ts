import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { npc, campaign, campaignEntity } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { NpcNotFoundError, NpcRevisionConflictError, InvalidNpcInputError } from "./errors";

export * from "./errors";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(npc) };
const identity = and(eq(npc.id, campaignEntity.id), eq(npc.campaignId, campaignEntity.campaignId));

function ownedNpcs(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(npc).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, npc.campaignId), eq(campaign.ownerUserId, actor.userId)));
}

export async function listOwnedNpcs(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedNpcs(db, actor).where(eq(npc.campaignId, campaignId));
}

export async function getOwnedNpc(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new NpcNotFoundError();
  const [row] = await ownedNpcs(db, actor).where(eq(npc.id, id));
  if (!row) throw new NpcNotFoundError();
  return row;
}

function validateFields(input: { name?: string; description?: string | null; role?: string | null; currentState?: string | null }) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) throw new InvalidNpcInputError();
  for (const value of [input.description, input.role, input.currentState]) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.includes("\0"))) throw new InvalidNpcInputError();
  }
}

export async function createNpc(db: NodePgDatabase, actor: Actor, input: Readonly<{ campaignId: string; name: string; description?: string | null; role?: string | null; currentState?: string | null }>) {
  if (!isUuid(input.campaignId) || input.name === undefined) throw new InvalidNpcInputError();
  validateFields(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId, entityType: "NPC", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(npc).values({ id: entity.id, campaignId: entity.campaignId, name: input.name, description: input.description, role: input.role, currentState: input.currentState }).returning();
    return { ...entity, ...typed };
  });
}

async function lockNpc(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new NpcNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "NPC"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new NpcNotFoundError();
  const current = await getOwnedNpc(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) throw new InvalidNpcInputError();
  if (current.revision !== expectedRevision) throw new NpcRevisionConflictError();
  return current;
}

const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

export async function editNpc(db: NodePgDatabase, actor: Actor, id: string, input: Readonly<{ expectedRevision: number; name?: string; description?: string | null; role?: string | null; currentState?: string | null }>) {
  return db.transaction(async tx => {
    const current = await lockNpc(tx, actor, id, input.expectedRevision);
    validateFields(input);
    const name = input.name === undefined ? current.name : input.name;
    const description = input.description === undefined ? current.description : input.description;
    const role = input.role === undefined ? current.role : input.role;
    const currentState = input.currentState === undefined ? current.currentState : input.currentState;
    if (name === current.name && description === current.description && role === current.role && currentState === current.currentState) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(npc).set({ name, description, role, currentState }).where(eq(npc.id, id));
    return getOwnedNpc(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockNpc(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt !== null)
      || (action === "trash" && current.deletedAt !== null)
      || (action === "restore" && current.deletedAt === null)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? {
        deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'`,
      } : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedNpc(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

export const archiveNpc = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "archive");
export const trashNpc = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "trash");
export const restoreNpc = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "restore");
