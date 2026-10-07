import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, party, partyMember, playerCharacter, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { archivePlayerCharacter, createPlayerCharacter, editPlayerCharacter, getOwnedPlayerCharacter, PlayerCharacterNotFoundError, PlayerCharacterRevisionConflictError, restorePlayerCharacter, trashPlayerCharacter } from "../../src/modules/player-characters";
import { archiveParty, createParty, editParty, getOwnedParty, InvalidPartyMemberError, listCampaignPartyMemberIds, listPartyMemberIds, PartyNotFoundError, PartyRevisionConflictError, restoreParty, trashParty } from "../../src/modules/parties";

const schema = `a20_party_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
  }
});
beforeEach(async () => {
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id };
  other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id;
  foreignCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("Player Character creation is atomic, typed, and owner scoped", async () => {
  const created = await createPlayerCharacter(db, actor, { campaignId, name: "Rin", playerName: "Ari", currentState: "Wounded" });
  expect(created).toMatchObject({ entityType: "PLAYER_CHARACTER", name: "Rin", playerName: "Ari", revision: 1 });
  await expect(getOwnedPlayerCharacter(db, other, created.id)).rejects.toBeInstanceOf(PlayerCharacterNotFoundError);
  await expect(editPlayerCharacter(db, other, created.id, { expectedRevision: 1, name: "Stolen" })).rejects.toBeInstanceOf(PlayerCharacterNotFoundError);
  await expect(createPlayerCharacter(db, actor, { campaignId: foreignCampaignId, name: "Stolen" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  const [wrong] = await db.insert(campaignEntity).values({ campaignId, entityType: "NPC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(playerCharacter).values({ id: wrong.id, campaignId, name: "Wrong" })).rejects.toMatchObject({ cause: { code: "23503", constraint: "player_character_campaign_entity_fk" } });
  await pool.query("ALTER TABLE player_character ADD CONSTRAINT a20_reject_pc CHECK (false) NOT VALID");
  try {
    await expect(createPlayerCharacter(db, actor, { campaignId, name: "Blocked" })).rejects.toThrow();
    expect(await db.select().from(campaignEntity)).toHaveLength(2);
  } finally { await pool.query("ALTER TABLE player_character DROP CONSTRAINT a20_reject_pc"); }
});

test("Party membership enforces same-Campaign PCs and preserves PCs when unlinked", async () => {
  const first = await createPlayerCharacter(db, actor, { campaignId, name: "Rin" });
  const second = await createPlayerCharacter(db, actor, { campaignId, name: "Sol" });
  const foreign = await createPlayerCharacter(db, other, { campaignId: foreignCampaignId, name: "Other" });
  await expect(createParty(db, actor, { campaignId, name: "Travelers", playerCharacterIds: [foreign.id] })).rejects.toBeInstanceOf(InvalidPartyMemberError);
  await expect(createParty(db, actor, { campaignId: foreignCampaignId, name: "Stolen" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  const created = await createParty(db, actor, { campaignId, name: "Travelers", playerCharacterIds: [first.id, second.id] });
  expect(await listPartyMemberIds(db, actor, created.id)).toEqual(expect.arrayContaining([first.id, second.id]));
  await expect(getOwnedParty(db, other, created.id)).rejects.toBeInstanceOf(PartyNotFoundError);
  await expect(editParty(db, other, created.id, { expectedRevision: 1, name: "Stolen" })).rejects.toBeInstanceOf(PartyNotFoundError);
  await expect(db.insert(partyMember).values({ campaignId, partyId: created.id, playerCharacterId: foreign.id })).rejects.toMatchObject({ cause: { code: "23503", constraint: "party_member_player_character_fk" } });
  const edited = await editParty(db, actor, created.id, { expectedRevision: 1, playerCharacterIds: [first.id] });
  expect(edited.revision).toBe(2);
  expect(await listPartyMemberIds(db, actor, created.id)).toEqual([first.id]);
  expect(await getOwnedPlayerCharacter(db, actor, second.id)).toMatchObject({ name: "Sol" });
});

test("Campaign Party membership groups only owned Campaign members", async () => {
  const first = await createPlayerCharacter(db, actor, { campaignId, name: "Rin" });
  const second = await createPlayerCharacter(db, actor, { campaignId, name: "Sol" });
  const foreign = await createPlayerCharacter(db, other, { campaignId: foreignCampaignId, name: "Other" });
  const populated = await createParty(db, actor, { campaignId, name: "Travelers", playerCharacterIds: [first.id, second.id] });
  const empty = await createParty(db, actor, { campaignId, name: "Empty" });
  const outside = await createParty(db, other, { campaignId: foreignCampaignId, name: "Outside", playerCharacterIds: [foreign.id] });

  const members = await listCampaignPartyMemberIds(db, actor, campaignId);
  expect(members.get(populated.id)).toEqual(expect.arrayContaining([first.id, second.id]));
  expect(members.get(populated.id)).toHaveLength(2);
  expect(members.get(empty.id) ?? []).toEqual([]);
  expect(members.has(outside.id)).toBe(false);
  await expect(listCampaignPartyMemberIds(db, other, campaignId)).rejects.toBeInstanceOf(CampaignNotFoundError);
});

test("Party subtype creation rolls back and concurrent composition edits reject a stale revision", async () => {
  const [wrong] = await db.insert(campaignEntity).values({ campaignId, entityType: "PLAYER_CHARACTER", createdByUserId: actor.userId }).returning();
  await expect(db.insert(party).values({ id: wrong.id, campaignId, name: "Wrong" })).rejects.toMatchObject({ cause: { code: "23503", constraint: "party_campaign_entity_fk" } });
  await pool.query("ALTER TABLE party ADD CONSTRAINT a20_reject_party CHECK (false) NOT VALID");
  try {
    await expect(createParty(db, actor, { campaignId, name: "Blocked" })).rejects.toThrow();
    expect(await db.select().from(campaignEntity)).toHaveLength(1);
  } finally { await pool.query("ALTER TABLE party DROP CONSTRAINT a20_reject_party"); }
  const first = await createPlayerCharacter(db, actor, { campaignId, name: "Rin" });
  const second = await createPlayerCharacter(db, actor, { campaignId, name: "Sol" });
  const group = await createParty(db, actor, { campaignId, name: "Travelers" });
  const outcomes = await Promise.allSettled([
    editParty(db, actor, group.id, { expectedRevision: 1, playerCharacterIds: [first.id] }),
    editParty(db, actor, group.id, { expectedRevision: 1, playerCharacterIds: [second.id] }),
  ]);
  expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find(outcome => outcome.status === "rejected");
  expect(rejected).toMatchObject({ reason: expect.any(PartyRevisionConflictError) });
  expect(await listPartyMemberIds(db, actor, group.id)).toHaveLength(1);
});

test("PC and Party revisions and lifecycle preserve state and composition", async () => {
  const character = await createPlayerCharacter(db, actor, { campaignId, name: "Rin" });
  const group = await createParty(db, actor, { campaignId, name: "Travelers", playerCharacterIds: [character.id] });
  expect(await editParty(db, actor, group.id, { expectedRevision: 1, playerCharacterIds: [character.id] })).toEqual(group);
  const editedPc = await editPlayerCharacter(db, actor, character.id, { expectedRevision: 1, currentState: "Ready" });
  expect(editedPc.revision).toBe(2);
  await expect(editPlayerCharacter(db, actor, character.id, { expectedRevision: 1, name: "Old" })).rejects.toBeInstanceOf(PlayerCharacterRevisionConflictError);
  const editedParty = await editParty(db, actor, group.id, { expectedRevision: 1, description: "On the road" });
  expect(editedParty.revision).toBe(2);
  await expect(editParty(db, actor, group.id, { expectedRevision: 1, name: "Old" })).rejects.toBeInstanceOf(PartyRevisionConflictError);
  const archivedPc = await archivePlayerCharacter(db, actor, character.id, 2);
  await trashPlayerCharacter(db, actor, character.id, 3);
  const restoredPc = await restorePlayerCharacter(db, actor, character.id, 4);
  expect(restoredPc).toMatchObject({ revision: 5, archivedAt: archivedPc.archivedAt, deletedAt: null, currentState: "Ready" });
  const archivedParty = await archiveParty(db, actor, group.id, 2);
  await trashParty(db, actor, group.id, 3);
  const restoredParty = await restoreParty(db, actor, group.id, 4);
  expect(restoredParty).toMatchObject({ revision: 5, archivedAt: archivedParty.archivedAt, deletedAt: null, description: "On the road" });
  expect(await listPartyMemberIds(db, actor, group.id)).toEqual([character.id]);
  expect(await db.select().from(party)).toHaveLength(1);
});
