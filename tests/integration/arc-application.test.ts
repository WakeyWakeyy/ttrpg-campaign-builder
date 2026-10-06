import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { arc, campaign, campaignEntity, location, userAccount } from "../../src/infrastructure/db/schema";
import { ArcNotFoundError, ArcRevisionConflictError, archiveArc, createArc, editArc, getOwnedArc, listOwnedArcs, restoreArc, trashArc } from "../../src/modules/arcs";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";

const schema = `a17_arc_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public -c timezone=America/New_York` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let otherCampaignId: string;

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
    { ownerUserId: actor.userId, name: "Owned" },
    { ownerUserId: other.userId, name: "Other" },
  ]).returning();
  campaignId = owned.id;
  otherCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("Arc creation is atomic and scoped to the internal Campaign owner", async () => {
  const created = await createArc(db, actor, { campaignId, name: "Rising tide", description: "The coast changes." });
  expect(created).toMatchObject({ campaignId, entityType: "ARC", name: "Rising tide", revision: 1, createdByUserId: actor.userId });
  expect(await listOwnedArcs(db, actor, campaignId)).toEqual([created]);
  await expect(getOwnedArc(db, other, created.id)).rejects.toBeInstanceOf(ArcNotFoundError);
  await expect(editArc(db, other, created.id, { expectedRevision: 1, name: "Stolen" })).rejects.toBeInstanceOf(ArcNotFoundError);
  await expect(createArc(db, actor, { campaignId: otherCampaignId, name: "Stolen" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  expect(await db.select().from(arc)).toHaveLength(1);
});

test("typed rows cannot claim a registry row of the other subtype", async () => {
  const [locationEntity] = await db.insert(campaignEntity).values({ campaignId, entityType: "LOCATION", createdByUserId: actor.userId }).returning();
  await expect(db.insert(arc).values({ id: locationEntity.id, campaignId, name: "Wrong type" })).rejects.toMatchObject({ cause: { code: "23503", constraint: "arc_campaign_entity_fk" } });
  const [arcEntity] = await db.insert(campaignEntity).values({ campaignId, entityType: "ARC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(location).values({ id: arcEntity.id, campaignId, name: "Wrong type" })).rejects.toMatchObject({ cause: { code: "23503", constraint: "location_campaign_entity_fk" } });
});

test("subtype failure rolls back the registry row", async () => {
  await pool.query("ALTER TABLE arc ADD CONSTRAINT a17_reject_arc CHECK (false)");
  try {
    await expect(createArc(db, actor, { campaignId, name: "Blocked" })).rejects.toThrow();
    expect(await db.select().from(campaignEntity)).toEqual([]);
    expect(await db.select().from(arc)).toEqual([]);
  } finally { await pool.query("ALTER TABLE arc DROP CONSTRAINT a17_reject_arc"); }
});

test("edits reject stale revisions and current-revision no-ops do not write", async () => {
  const created = await createArc(db, actor, { campaignId, name: "Rising tide" });
  const same = await editArc(db, actor, created.id, { expectedRevision: 1, name: "Rising tide" });
  expect(same).toEqual(created);
  const changed = await editArc(db, actor, created.id, { expectedRevision: 1, description: "A long arc" });
  expect(changed).toMatchObject({ name: "Rising tide", description: "A long arc", revision: 2 });
  await expect(editArc(db, actor, created.id, { expectedRevision: 1, name: "Stale" })).rejects.toBeInstanceOf(ArcRevisionConflictError);
  expect(await getOwnedArc(db, actor, created.id)).toEqual(changed);
});

test("Archive, Trash and Restore preserve prior archive state", async () => {
  const created = await createArc(db, actor, { campaignId, name: "Rising tide" });
  const archived = await archiveArc(db, actor, created.id, 1);
  expect(archived.archivedAt).not.toBeNull();
  const trashed = await trashArc(db, actor, created.id, 2);
  expect(trashed.deletedAt).not.toBeNull();
  expect(trashed.purgeAfter).not.toBeNull();
  const restored = await restoreArc(db, actor, created.id, 3);
  expect(restored).toMatchObject({ revision: 4, archivedAt: archived.archivedAt, deletedAt: null, purgeAfter: null });
  await expect(restoreArc(db, actor, created.id, 3)).rejects.toBeInstanceOf(ArcRevisionConflictError);
});
