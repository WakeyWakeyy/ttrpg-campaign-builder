import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, clue, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { createLocation, archiveLocation } from "../../src/modules/locations";
import { archiveClue, ClueNotFoundError, ClueRevisionConflictError, createClue, editClue,
  getOwnedClue, InvalidClueInputError, restoreClue, trashClue } from "../../src/modules/knowledge";

const schema = `knowledge_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries)
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
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

test("owns clues, validates discovery locations, and protects revisions", async () => {
  const place = await createLocation(db, actor, { campaignId, name: "Library" });
  await expect(createClue(db, actor, { campaignId: foreignCampaignId, title: "Stolen", secret: "Truth", discoveryLocationId: null }))
    .rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createClue(db, actor, { campaignId, title: "Note", secret: "Truth", discoveryLocationId: randomUUID() }))
    .rejects.toBeInstanceOf(InvalidClueInputError);
  const saved = await createClue(db, actor, { campaignId, title: "Note", secret: "A hidden passage", discoveryLocationId: place.id });
  expect(saved).toMatchObject({ entityType: "CLUE", revision: 1, discoveryLocationId: place.id });
  await expect(getOwnedClue(db, other, saved.id)).rejects.toBeInstanceOf(ClueNotFoundError);
  await expect(db.insert(clue).values({ id: randomUUID(), campaignId, title: "Orphan", secret: "Truth" }))
    .rejects.toMatchObject({ cause: { constraint: "clue_entity_fk" } });
  await expect(db.update(clue).set({ discoveryLocationId: randomUUID() }).where(eq(clue.id, saved.id)))
    .rejects.toMatchObject({ cause: { constraint: "clue_discovery_location_fk" } });
  const edited = await editClue(db, actor, saved.id, { expectedRevision: 1, title: "New note", secret: "Truth", discoveryLocationId: place.id });
  expect(edited.revision).toBe(2);
  await expect(editClue(db, actor, saved.id, { expectedRevision: 1, title: "Old", secret: "Truth", discoveryLocationId: null }))
    .rejects.toBeInstanceOf(ClueRevisionConflictError);
  await archiveLocation(db, actor, place.id, place.revision);
  await expect(editClue(db, actor, saved.id, { expectedRevision: 2, title: "Still here", secret: "Truth", discoveryLocationId: place.id }))
    .resolves.toMatchObject({ revision: 3 });
  const archived = await archiveClue(db, actor, saved.id, 3);
  const trashed = await trashClue(db, actor, saved.id, archived.revision);
  expect(trashed.purgeAfter).not.toBeNull();
  const restored = await restoreClue(db, actor, saved.id, trashed.revision);
  expect(restored.archivedAt).not.toBeNull();
  expect(restored.deletedAt).toBeNull();
});
