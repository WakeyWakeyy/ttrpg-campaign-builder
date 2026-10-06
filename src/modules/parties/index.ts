import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, party, partyMember, playerCharacter } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { InvalidPartyInputError, InvalidPartyMemberError, PartyNotFoundError, PartyRevisionConflictError } from "./errors";

export * from "./errors";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
type Fields = { name?: string; description?: string | null; playerCharacterIds?: string[] };
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(party) };
const identity = and(eq(party.id, campaignEntity.id), eq(party.campaignId, campaignEntity.campaignId));
const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function ownedParties(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(party).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, party.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedParties(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedParties(db, actor).where(eq(party.campaignId, campaignId));
}
export async function getOwnedParty(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new PartyNotFoundError();
  const [row] = await ownedParties(db, actor).where(eq(party.id, id));
  if (!row) throw new PartyNotFoundError();
  return row;
}
export async function listPartyMemberIds(db: NodePgDatabase, actor: Actor, id: string) {
  await getOwnedParty(db, actor, id);
  return (await db.select({ id: partyMember.playerCharacterId }).from(partyMember).where(eq(partyMember.partyId, id))).map(row => row.id);
}
async function lockCampaign(tx: Transaction, actor: Actor, id: string) {
  if (!isUuid(id)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign)
    .where(and(eq(campaign.id, id), eq(campaign.ownerUserId, actor.userId))).for("update");
  if (!row) throw new CampaignNotFoundError();
}
function validateFields(input: Fields) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) throw new InvalidPartyInputError();
  if (input.description !== undefined && input.description !== null && (typeof input.description !== "string" || input.description.includes("\0"))) throw new InvalidPartyInputError();
  if (input.playerCharacterIds !== undefined && (!Array.isArray(input.playerCharacterIds)
    || input.playerCharacterIds.some(id => !isUuid(id))
    || new Set(input.playerCharacterIds.map(id => id.toLowerCase())).size !== input.playerCharacterIds.length)) throw new InvalidPartyMemberError();
}
async function validateMembers(tx: Transaction, campaignId: string, ids: string[]) {
  for (const id of ids) {
    const [found] = await tx.select({ id: playerCharacter.id }).from(playerCharacter)
      .where(and(eq(playerCharacter.id, id), eq(playerCharacter.campaignId, campaignId)));
    if (!found) throw new InvalidPartyMemberError();
  }
}
export async function createParty(db: NodePgDatabase, actor: Actor, input: Readonly<Fields & { campaignId: string; name: string }>) {
  if (input.name === undefined) throw new InvalidPartyInputError();
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    validateFields(input);
    await validateMembers(tx, input.campaignId, input.playerCharacterIds ?? []);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId, entityType: "PARTY", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(party).values({ id: entity.id, campaignId: entity.campaignId, name: input.name, description: input.description }).returning();
    if (input.playerCharacterIds?.length) await tx.insert(partyMember).values(input.playerCharacterIds.map(playerCharacterId => ({ campaignId: entity.campaignId, partyId: entity.id, playerCharacterId })));
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}
async function lockParty(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new PartyNotFoundError();
  const [row] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "PARTY"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!row) throw new PartyNotFoundError();
  const current = await getOwnedParty(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) throw new InvalidPartyInputError();
  if (current.revision !== expectedRevision) throw new PartyRevisionConflictError();
  return current;
}
export async function editParty(db: NodePgDatabase, actor: Actor, id: string, input: Readonly<Fields & { expectedRevision: number }>) {
  return db.transaction(async tx => {
    const owned = await getOwnedParty(tx, actor, id);
    await lockCampaign(tx, actor, owned.campaignId);
    const current = await lockParty(tx, actor, id, input.expectedRevision);
    validateFields(input);
    await validateMembers(tx, current.campaignId, input.playerCharacterIds ?? []);
    const name = input.name ?? current.name;
    const description = input.description === undefined ? current.description : input.description;
    const oldIds = input.playerCharacterIds === undefined ? [] : await tx.select({ id: partyMember.playerCharacterId }).from(partyMember).where(eq(partyMember.partyId, id));
    const newIds = input.playerCharacterIds?.map(value => value.toLowerCase()).sort();
    const membersChanged = newIds !== undefined && JSON.stringify(oldIds.map(row => row.id).sort()) !== JSON.stringify(newIds);
    if (name === current.name && description === current.description && !membersChanged) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(party).set({ name, description }).where(eq(party.id, id));
    if (membersChanged) {
      await tx.delete(partyMember).where(eq(partyMember.partyId, id));
      if (newIds!.length) await tx.insert(partyMember).values(newIds!.map(playerCharacterId => ({ campaignId: current.campaignId, partyId: id, playerCharacterId })));
    }
    return getOwnedParty(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockParty(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt !== null) || (action === "trash" && current.deletedAt !== null)
      || (action === "restore" && current.deletedAt === null)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`, purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
        : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedParty(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveParty = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const trashParty = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreParty = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
