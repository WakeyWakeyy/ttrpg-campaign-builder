import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, faction, factionMembership, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { archiveFaction, createFaction, editFaction, FactionNotFoundError, FactionRevisionConflictError, InvalidFactionMembershipError, listFactionMemberships, restoreFaction, setFactionMembership, trashFaction } from "../../src/modules/factions";
import type { Actor } from "../../src/modules/identity";
import { createNpc } from "../../src/modules/npcs";
import { createPlayerCharacter } from "../../src/modules/player-characters";

const schema = `a21_faction_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
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

test("Faction creation is atomic, typed, and owner scoped", async () => {
  await expect(createFaction(db, actor, { campaignId: foreignCampaignId, name: "Stolen" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  const created = await createFaction(db, actor, { campaignId, name: "The Lanterns", purpose: "Protect travelers" });
  expect(created).toMatchObject({ entityType: "FACTION", revision: 1, purpose: "Protect travelers" });
  await expect(editFaction(db, other, created.id, { expectedRevision: 1, name: "Stolen" })).rejects.toBeInstanceOf(FactionNotFoundError);
  const [wrong] = await db.insert(campaignEntity).values({ campaignId, entityType: "NPC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(faction).values({ campaignId, id: wrong.id, name: "Wrong" })).rejects.toMatchObject({ cause: { code: "23503", constraint: "faction_campaign_entity_fk" } });
  await pool.query("ALTER TABLE faction ADD CONSTRAINT a21_reject_faction CHECK (false) NOT VALID");
  try {
    await expect(createFaction(db, actor, { campaignId, name: "Blocked" })).rejects.toThrow();
    expect(await db.select().from(campaignEntity)).toHaveLength(2);
  } finally { await pool.query("ALTER TABLE faction DROP CONSTRAINT a21_reject_faction"); }
});

test("Memberships retain role, rank and former status with same-Campaign integrity", async () => {
  const group = await createFaction(db, actor, { campaignId, name: "The Lanterns" });
  const member = await createNpc(db, actor, { campaignId, name: "Mara" });
  const pc = await createPlayerCharacter(db, actor, { campaignId, name: "Rin" });
  const foreign = await createNpc(db, other, { campaignId: foreignCampaignId, name: "Outsider" });
  await expect(setFactionMembership(db, actor, group.id, 1, { memberType: "NPC", memberId: foreign.id })).rejects.toBeInstanceOf(InvalidFactionMembershipError);
  await expect(db.insert(factionMembership).values({ campaignId, factionId: group.id, npcId: foreign.id })).rejects.toMatchObject({ cause: { code: "23503", constraint: "faction_membership_npc_fk" } });
  await expect(db.insert(factionMembership).values({ campaignId, factionId: group.id, npcId: member.id, playerCharacterId: pc.id })).rejects.toMatchObject({ cause: { code: "23514", constraint: "faction_membership_one_member" } });
  await setFactionMembership(db, actor, group.id, 1, { memberType: "NPC", memberId: member.id, role: "Scout", rank: "Captain" });
  await setFactionMembership(db, actor, group.id, 2, { memberType: "PLAYER_CHARACTER", memberId: pc.id });
  await setFactionMembership(db, actor, group.id, 3, { memberType: "NPC", memberId: member.id, role: "Scout", rank: "Captain", status: "FORMER" });
  expect(await listFactionMemberships(db, actor, group.id)).toEqual(expect.arrayContaining([
    expect.objectContaining({ npcId: member.id, role: "Scout", rank: "Captain", status: "FORMER" }),
    expect.objectContaining({ playerCharacterId: pc.id, status: "ACTIVE" }),
  ]));
});

test("Concurrent edits reject stale revisions and lifecycle preserves memberships", async () => {
  const member = await createNpc(db, actor, { campaignId, name: "Mara" });
  const group = await createFaction(db, actor, { campaignId, name: "The Lanterns" });
  const outcomes = await Promise.allSettled([
    setFactionMembership(db, actor, group.id, 1, { memberType: "NPC", memberId: member.id }),
    editFaction(db, actor, group.id, { expectedRevision: 1, purpose: "New purpose" }),
  ]);
  expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find(outcome => outcome.status === "rejected")).toMatchObject({ reason: expect.any(FactionRevisionConflictError) });
  const current = await (await import("../../src/modules/factions")).getOwnedFaction(db, actor, group.id);
  if (!(await listFactionMemberships(db, actor, group.id)).length) await setFactionMembership(db, actor, group.id, current.revision, { memberType: "NPC", memberId: member.id });
  const before = await (await import("../../src/modules/factions")).getOwnedFaction(db, actor, group.id);
  const archived = await archiveFaction(db, actor, group.id, before.revision);
  await trashFaction(db, actor, group.id, archived.revision);
  const restored = await restoreFaction(db, actor, group.id, archived.revision + 1);
  expect(restored.archivedAt).toEqual(archived.archivedAt);
  expect(restored.deletedAt).toBeNull();
  expect(await listFactionMemberships(db, actor, group.id)).toHaveLength(1);
});
