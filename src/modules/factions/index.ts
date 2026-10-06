import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, faction, factionMembership, npc, playerCharacter } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { FactionNotFoundError, FactionRevisionConflictError, InvalidFactionInputError, InvalidFactionMembershipError } from "./errors";

export * from "./errors";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
type FactionFields = { name?: string; description?: string | null; purpose?: string | null; currentState?: string | null };
export type MembershipInput = { memberType: "NPC" | "PLAYER_CHARACTER"; memberId: string; role?: string | null; rank?: string | null; status?: "ACTIVE" | "FORMER" };
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(faction) };
const identity = and(eq(faction.id, campaignEntity.id), eq(faction.campaignId, campaignEntity.campaignId));
const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function ownedFactions(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(faction).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, faction.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedFactions(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedFactions(db, actor).where(eq(faction.campaignId, campaignId));
}
export async function getOwnedFaction(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new FactionNotFoundError();
  const [row] = await ownedFactions(db, actor).where(eq(faction.id, id));
  if (!row) throw new FactionNotFoundError();
  return row;
}
export async function listFactionMemberships(db: NodePgDatabase, actor: Actor, id: string) {
  await getOwnedFaction(db, actor, id);
  return db.select().from(factionMembership).where(eq(factionMembership.factionId, id)).orderBy(factionMembership.createdAt);
}
function validateFields(input: FactionFields) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) throw new InvalidFactionInputError();
  for (const value of [input.description, input.purpose, input.currentState]) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.includes("\0"))) throw new InvalidFactionInputError();
  }
}
export async function createFaction(db: NodePgDatabase, actor: Actor, input: Readonly<FactionFields & { campaignId: string; name: string }>) {
  if (!isUuid(input.campaignId) || input.name === undefined) throw new InvalidFactionInputError();
  validateFields(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId, entityType: "FACTION", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(faction).values({ id: entity.id, campaignId: entity.campaignId, name: input.name, description: input.description, purpose: input.purpose, currentState: input.currentState }).returning();
    return { ...entity, ...typed };
  });
}
async function lockFaction(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new FactionNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "FACTION"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!row) throw new FactionNotFoundError();
  const current = await getOwnedFaction(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) throw new InvalidFactionInputError();
  if (current.revision !== expectedRevision) throw new FactionRevisionConflictError();
  return current;
}
export async function editFaction(db: NodePgDatabase, actor: Actor, id: string, input: Readonly<FactionFields & { expectedRevision: number }>) {
  return db.transaction(async tx => {
    const current = await lockFaction(tx, actor, id, input.expectedRevision);
    if (current.deletedAt) throw new InvalidFactionInputError();
    validateFields(input);
    const name = input.name ?? current.name;
    const description = input.description === undefined ? current.description : input.description;
    const purpose = input.purpose === undefined ? current.purpose : input.purpose;
    const currentState = input.currentState === undefined ? current.currentState : input.currentState;
    if (name === current.name && description === current.description && purpose === current.purpose && currentState === current.currentState) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(faction).set({ name, description, purpose, currentState }).where(eq(faction.id, id));
    return getOwnedFaction(tx, actor, id);
  });
}
export async function setFactionMembership(db: NodePgDatabase, actor: Actor, factionId: string, expectedRevision: number, input: Readonly<MembershipInput>) {
  return db.transaction(async tx => {
    const current = await lockFaction(tx, actor, factionId, expectedRevision);
    if (current.deletedAt || !isUuid(input.memberId) || !["NPC", "PLAYER_CHARACTER"].includes(input.memberType)
      || (input.status !== undefined && input.status !== "ACTIVE" && input.status !== "FORMER")
      || [input.role, input.rank].some(value => value !== undefined && value !== null && (typeof value !== "string" || value.includes("\0")))) throw new InvalidFactionMembershipError();
    const member = input.memberType === "NPC" ? npc : playerCharacter;
    const [found] = await tx.select({ id: member.id }).from(member).where(and(eq(member.id, input.memberId), eq(member.campaignId, current.campaignId)));
    if (!found) throw new InvalidFactionMembershipError();
    const key = input.memberType === "NPC" ? eq(factionMembership.npcId, input.memberId) : eq(factionMembership.playerCharacterId, input.memberId);
    const [existing] = await tx.select().from(factionMembership).where(and(eq(factionMembership.factionId, factionId), key));
    const role = input.role ?? null;
    const rank = input.rank ?? null;
    const status = input.status ?? "ACTIVE";
    if (existing && existing.role === role && existing.rank === rank && existing.status === status) return current;
    if (existing) await tx.update(factionMembership).set({ role, rank, status }).where(eq(factionMembership.id, existing.id));
    else await tx.insert(factionMembership).values({ campaignId: current.campaignId, factionId,
      npcId: input.memberType === "NPC" ? input.memberId : null,
      playerCharacterId: input.memberType === "PLAYER_CHARACTER" ? input.memberId : null, role, rank, status });
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, factionId));
    return getOwnedFaction(tx, actor, factionId);
  });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockFaction(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt) || (action === "trash" && current.deletedAt)
      || (action === "restore" && !current.deletedAt)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`, purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
        : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedFaction(tx, actor, id);
  });
}
export const archiveFaction = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const trashFaction = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreFaction = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
