import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { playerCharacter, campaign, campaignEntity } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { PlayerCharacterNotFoundError, PlayerCharacterRevisionConflictError, InvalidPlayerCharacterInputError } from "./errors";

export * from "./errors";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(playerCharacter) };
const identity = and(eq(playerCharacter.id, campaignEntity.id), eq(playerCharacter.campaignId, campaignEntity.campaignId));

function ownedPlayerCharacters(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(playerCharacter).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, playerCharacter.campaignId), eq(campaign.ownerUserId, actor.userId)));
}

export async function listOwnedPlayerCharacters(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedPlayerCharacters(db, actor).where(eq(playerCharacter.campaignId, campaignId));
}

export async function getOwnedPlayerCharacter(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new PlayerCharacterNotFoundError();
  const [row] = await ownedPlayerCharacters(db, actor).where(eq(playerCharacter.id, id));
  if (!row) throw new PlayerCharacterNotFoundError();
  return row;
}

function validateFields(input: { name?: string; description?: string | null; playerName?: string | null; currentState?: string | null }) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) throw new InvalidPlayerCharacterInputError();
  for (const value of [input.description, input.playerName, input.currentState]) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.includes("\0"))) throw new InvalidPlayerCharacterInputError();
  }
}

export async function createPlayerCharacter(db: NodePgDatabase, actor: Actor, input: Readonly<{ campaignId: string; name: string; description?: string | null; playerName?: string | null; currentState?: string | null }>) {
  if (!isUuid(input.campaignId) || input.name === undefined) throw new InvalidPlayerCharacterInputError();
  validateFields(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId, entityType: "PLAYER_CHARACTER", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(playerCharacter).values({ id: entity.id, campaignId: entity.campaignId, name: input.name, description: input.description, playerName: input.playerName, currentState: input.currentState }).returning();
    return { ...entity, ...typed };
  });
}

async function lockPlayerCharacter(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new PlayerCharacterNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "PLAYER_CHARACTER"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new PlayerCharacterNotFoundError();
  const current = await getOwnedPlayerCharacter(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) throw new InvalidPlayerCharacterInputError();
  if (current.revision !== expectedRevision) throw new PlayerCharacterRevisionConflictError();
  return current;
}

const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

export async function editPlayerCharacter(db: NodePgDatabase, actor: Actor, id: string, input: Readonly<{ expectedRevision: number; name?: string; description?: string | null; playerName?: string | null; currentState?: string | null }>) {
  return db.transaction(async tx => {
    const current = await lockPlayerCharacter(tx, actor, id, input.expectedRevision);
    validateFields(input);
    const name = input.name === undefined ? current.name : input.name;
    const description = input.description === undefined ? current.description : input.description;
    const playerName = input.playerName === undefined ? current.playerName : input.playerName;
    const currentState = input.currentState === undefined ? current.currentState : input.currentState;
    if (name === current.name && description === current.description && playerName === current.playerName && currentState === current.currentState) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(playerCharacter).set({ name, description, playerName, currentState }).where(eq(playerCharacter.id, id));
    return getOwnedPlayerCharacter(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockPlayerCharacter(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt !== null)
      || (action === "trash" && current.deletedAt !== null)
      || (action === "restore" && current.deletedAt === null)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? {
        deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'`,
      } : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedPlayerCharacter(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

export const archivePlayerCharacter = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "archive");
export const trashPlayerCharacter = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "trash");
export const restorePlayerCharacter = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "restore");
