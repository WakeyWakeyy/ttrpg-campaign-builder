import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, npc, userAccount } from "../../src/infrastructure/db/schema";
import { archiveNpc, createNpc, editNpc, getOwnedNpc, InvalidNpcInputError, NpcNotFoundError, NpcRevisionConflictError, restoreNpc, trashNpc } from "../../src/modules/npcs";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";

const schema = `a19_npc_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let stranger: Actor;
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
  const [owner, other] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id };
  stranger = { userId: other.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: stranger.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id;
  foreignCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("NPC creation is atomic and owner scoped", async () => {
  const created = await createNpc(db, actor, { campaignId, name: "Mira", role: "Innkeeper", currentState: "Missing" });
  expect(created).toMatchObject({ entityType: "NPC", name: "Mira", role: "Innkeeper", currentState: "Missing", revision: 1 });
  await expect(getOwnedNpc(db, stranger, created.id)).rejects.toBeInstanceOf(NpcNotFoundError);
  await expect(editNpc(db, stranger, created.id, { expectedRevision: 1, name: "Stolen" })).rejects.toBeInstanceOf(NpcNotFoundError);
  await expect(createNpc(db, actor, { campaignId: foreignCampaignId, name: "Stolen" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  expect(await db.select().from(npc)).toHaveLength(1);
});

test("typed NPC identity rejects another subtype and rolls back failed creation", async () => {
  const [entity] = await db.insert(campaignEntity).values({ campaignId, entityType: "ARC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(npc).values({ id: entity.id, campaignId, name: "Wrong" })).rejects.toMatchObject({ cause: { code: "23503", constraint: "npc_campaign_entity_fk" } });
  await pool.query("ALTER TABLE npc ADD CONSTRAINT a19_reject_npc CHECK (false)");
  try {
    await expect(createNpc(db, actor, { campaignId, name: "Blocked" })).rejects.toThrow();
    expect(await db.select().from(campaignEntity)).toHaveLength(1);
  } finally { await pool.query("ALTER TABLE npc DROP CONSTRAINT a19_reject_npc"); }
});

test("revisions protect NPC edits and lifecycle preserves prior archive state", async () => {
  const created = await createNpc(db, actor, { campaignId, name: "Mira" });
  expect(await editNpc(db, actor, created.id, { expectedRevision: 1, name: "Mira" })).toEqual(created);
  const changed = await editNpc(db, actor, created.id, { expectedRevision: 1, currentState: "Found" });
  expect(changed).toMatchObject({ revision: 2, currentState: "Found" });
  await expect(editNpc(db, actor, created.id, { expectedRevision: 1, role: "Guard" })).rejects.toBeInstanceOf(NpcRevisionConflictError);
  await expect(editNpc(db, actor, created.id, { expectedRevision: 2, name: " " })).rejects.toBeInstanceOf(InvalidNpcInputError);
  const archived = await archiveNpc(db, actor, created.id, 2);
  const trashed = await trashNpc(db, actor, created.id, 3);
  expect(trashed.purgeAfter).not.toBeNull();
  const restored = await restoreNpc(db, actor, created.id, 4);
  expect(restored).toMatchObject({ revision: 5, archivedAt: archived.archivedAt, deletedAt: null, currentState: "Found" });
});
