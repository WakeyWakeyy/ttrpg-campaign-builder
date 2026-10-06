import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, item, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { createLocation } from "../../src/modules/locations";
import { createNpc } from "../../src/modules/npcs";
import { createPlayerCharacter } from "../../src/modules/player-characters";
import { archiveItem, createItem, editItem, getOwnedItem, InvalidItemInputError,
  ItemNotFoundError, ItemRevisionConflictError, listOwnedItems, restoreItem, trashItem } from "../../src/modules/items";

const schema = `a23_item_${randomUUID().replaceAll("-", "")}`;
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
  actor = { userId: owner.id }; other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id; foreignCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("items have one same-campaign locator and typed identity", async () => {
  const place = await createLocation(db, actor, { campaignId, name: "Vault" });
  const npc = await createNpc(db, actor, { campaignId, name: "Keeper" });
  const pc = await createPlayerCharacter(db, actor, { campaignId, name: "Hero" });
  const outsider = await createLocation(db, other, { campaignId: foreignCampaignId, name: "Outside" });
  await expect(createItem(db, actor, { campaignId: foreignCampaignId, name: "Key" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createItem(db, actor, { campaignId, name: "Key", locationId: outsider.id })).rejects.toBeInstanceOf(InvalidItemInputError);
  await expect(createItem(db, actor, { campaignId, name: "Key", locationId: place.id, npcHolderId: npc.id })).rejects.toBeInstanceOf(InvalidItemInputError);
  const created = await createItem(db, actor, { campaignId, name: "Key", locationId: place.id, significance: "Opens the gate" });
  expect(created).toMatchObject({ entityType: "ITEM", revision: 1, locationId: place.id });
  expect(await listOwnedItems(db, actor, campaignId)).toHaveLength(1);
  await expect(getOwnedItem(db, other, created.id)).rejects.toBeInstanceOf(ItemNotFoundError);
  await expect(db.insert(item).values({ campaignId, id: randomUUID(), name: "Orphan" }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "item_campaign_entity_fk" } });
  const [wrong] = await db.insert(campaignEntity).values({ campaignId, entityType: "NPC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(item).values({ campaignId, id: wrong.id, name: "Wrong" }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "item_campaign_entity_fk" } });
  const [cross] = await db.insert(campaignEntity).values({ campaignId, entityType: "ITEM", createdByUserId: actor.userId }).returning();
  await expect(db.insert(item).values({ campaignId, id: cross.id, name: "Cross", locationId: outsider.id }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "item_location_fk" } });
  await expect(db.insert(item).values({ campaignId, id: cross.id, name: "Two", locationId: place.id, npcHolderId: npc.id }))
    .rejects.toMatchObject({ cause: { code: "23514", constraint: "item_one_locator" } });
  const moved = await editItem(db, actor, created.id, { expectedRevision: 1, name: "Key", npcHolderId: npc.id });
  expect(moved).toMatchObject({ locationId: null, npcHolderId: npc.id });
  const carried = await editItem(db, actor, created.id, { expectedRevision: moved.revision, name: "Key", playerCharacterHolderId: pc.id });
  expect(carried).toMatchObject({ npcHolderId: null, playerCharacterHolderId: pc.id });
});

test("concurrent edits reject stale revisions and lifecycle preserves item details", async () => {
  const created = await createItem(db, actor, { campaignId, name: "Relic", notes: "From the ruins" });
  const outcomes = await Promise.allSettled([
    editItem(db, actor, created.id, { expectedRevision: 1, name: "Relic", notes: "First" }),
    editItem(db, actor, created.id, { expectedRevision: 1, name: "Relic", notes: "Second" }),
  ]);
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find(result => result.status === "rejected")).toMatchObject({ reason: expect.any(ItemRevisionConflictError) });
  const current = await getOwnedItem(db, actor, created.id);
  const archived = await archiveItem(db, actor, created.id, current.revision);
  const trashed = await trashItem(db, actor, created.id, archived.revision);
  const restored = await restoreItem(db, actor, created.id, trashed.revision);
  expect(restored).toMatchObject({ archivedAt: archived.archivedAt, deletedAt: null, notes: current.notes });
});
