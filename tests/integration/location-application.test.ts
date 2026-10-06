import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, location, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { archiveLocation, createLocation, editLocation, getOwnedLocation, InvalidLocationInputError, InvalidLocationParentError, listOwnedLocations, LocationNotFoundError, LocationRevisionConflictError, restoreLocation, trashLocation } from "../../src/modules/locations";

const schema = `a8_location_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  application_name: schema,
  options: `-c search_path=${schema},public -c timezone=America/New_York -c lock_timeout=4000`,
});
const db = drizzle({ client: pool });
let actor: Actor;
let otherActor: Actor;
let campaignId: string;
let otherCampaignId: string;
let secondOwnedCampaignId: string;
const create = (name = "Harbor", parentLocationId?: string | null) => createLocation(db, actor, { campaignId, name, parentLocationId });

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
  otherActor = { userId: other.id };
  const campaigns = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" },
    { ownerUserId: otherActor.userId, name: "Other" },
    { ownerUserId: actor.userId, name: "Second owned" },
  ]).returning();
  [campaignId, otherCampaignId, secondOwnedCampaignId] = campaigns.map(row => row.id);
});
afterAll(async () => {
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await pool.end(); }
});

test("creation derives registry identity and internal creator, allows duplicates and returns owned state", async () => {
  const parent = await create();
  const submitted = {
    campaignId, name: "Harbor", description: "  Original notes\n", parentLocationId: parent.id,
    id: randomUUID(), createdByUserId: otherActor.userId, entityType: "NPC", revision: 99,
    archivedAt: new Date(), deletedAt: new Date(), purgeAfter: new Date(),
  };
  const child = await createLocation(db, actor, submitted);
  expect(child).toMatchObject({
    campaignId, name: submitted.name, description: submitted.description, parentLocationId: parent.id,
    createdByUserId: actor.userId, entityType: "LOCATION", revision: 1,
    archivedAt: null, deletedAt: null, purgeAfter: null,
  });
  expect(child.id).not.toBe(submitted.id);
  expect(parent).toMatchObject({ description: null, parentLocationId: null });
  expect(await getOwnedLocation(db, actor, child.id)).toEqual(child);
  expect(await listOwnedLocations(db, actor, campaignId)).toEqual(expect.arrayContaining([parent, child]));
  expect(await db.select().from(location)).toHaveLength(2);
  expect((await db.select().from(campaignEntity)).map(row => row.id).sort()).toEqual([parent.id, child.id].sort());
});

test("all direct lookup/mutations hide malformed, missing and non-owned identities identically", async () => {
  const owned = await create();
  for (const id of [owned.id, randomUUID(), "invalid", ""]) {
    const calls = [
      () => getOwnedLocation(db, otherActor, id),
      () => editLocation(db, otherActor, id, { expectedRevision: 1, name: "Stolen" }),
      () => editLocation(db, otherActor, id, { expectedRevision: 1, parentLocationId: null }),
      ...[archiveLocation, trashLocation, restoreLocation].map(command => () => command(db, otherActor, id, 1)),
    ];
    for (const call of calls) {
      const result = call();
      await expect(result).rejects.toBeInstanceOf(LocationNotFoundError);
      await expect(result).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", message: "Location not found." });
    }
  }
  expect(await getOwnedLocation(db, actor, owned.id)).toEqual(owned);
});

test("Campaign-scoped reads and creation require ownership", async () => {
  for (const id of [otherCampaignId, randomUUID(), "bad"]) {
    await expect(listOwnedLocations(db, actor, id)).rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(createLocation(db, actor, { campaignId: id, name: "Invalid" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  }
  expect(await listOwnedLocations(db, actor, campaignId)).toEqual([]);
});

test("parents outside the Campaign, missing and malformed parents share one typed rejection", async () => {
  const other = await createLocation(db, otherActor, { campaignId: otherCampaignId, name: "Private" });
  const second = await createLocation(db, actor, { campaignId: secondOwnedCampaignId, name: "Visible but invalid" });
  const child = await create();
  for (const parentLocationId of [other.id, second.id, randomUUID(), "invalid", ""]) {
    for (const command of [
      () => create("Invalid", parentLocationId),
      () => editLocation(db, actor, child.id, { expectedRevision: 1, parentLocationId }),
    ]) {
      const result = command();
      await expect(result).rejects.toBeInstanceOf(InvalidLocationParentError);
      await expect(result).rejects.toMatchObject({ code: "INVALID_LOCATION_PARENT", message: "Invalid Location parent." });
    }
  }
  expect(await getOwnedLocation(db, actor, child.id)).toEqual(child);
});

test.each(["", " \t\n", null, 123, "null\0byte"])("invalid name %j is rejected on create and edit", async name => {
  const child = await create();
  await expect(create(name as string)).rejects.toBeInstanceOf(InvalidLocationInputError);
  await expect(editLocation(db, actor, child.id, { expectedRevision: 1, name: name as string })).rejects.toBeInstanceOf(InvalidLocationInputError);
  expect(await getOwnedLocation(db, actor, child.id)).toEqual(child);
});

test.each([0, -1, 1.5, NaN, undefined, "1", 2147483648])("all mutations reject invalid expectedRevision %j", async revision => {
  const child = await create();
  await expect(editLocation(db, actor, child.id, { expectedRevision: revision as number })).rejects.toBeInstanceOf(InvalidLocationInputError);
  for (const command of [archiveLocation, trashLocation, restoreLocation]) {
    await expect(command(db, actor, child.id, revision as number)).rejects.toBeInstanceOf(InvalidLocationInputError);
  }
});

test("real typed insert failure rolls back the registry insert", async () => {
  await pool.query("ALTER TABLE location ADD CONSTRAINT a8_reject_insert CHECK (false)");
  try {
    await expect(create()).rejects.toMatchObject({ cause: { code: "23514", constraint: "a8_reject_insert" } });
    expect(await db.select().from(location)).toEqual([]);
    expect(await db.select().from(campaignEntity)).toEqual([]);
  } finally { await pool.query("ALTER TABLE location DROP CONSTRAINT a8_reject_insert"); }
});

test("meaningful edits advance once, preserve omitted fields, and allow explicit clearing", async () => {
  const parent = await create("Parent");
  const child = await create("Child");
  const edited = await editLocation(db, actor, child.id, {
    expectedRevision: 1, name: "Updated", description: "Notes", parentLocationId: parent.id,
  });
  expect(edited).toMatchObject({ name: "Updated", description: "Notes", parentLocationId: parent.id, revision: 2 });
  expect(edited.updatedAt.getTime()).toBeGreaterThan(child.updatedAt.getTime());
  expect(edited.createdAt).toEqual(child.createdAt);
  const cleared = await editLocation(db, actor, child.id, { expectedRevision: 2, description: null, parentLocationId: null });
  expect(cleared).toMatchObject({ name: "Updated", description: null, parentLocationId: null, revision: 3 });
  expect(await getOwnedLocation(db, actor, parent.id)).toEqual(parent);
});

test("no-op edits skip typed writes and preserve revision/timestamp, but stale no-ops conflict", async () => {
  const parent = await create("Parent");
  const child = await create("Child", parent.id);
  // NOT VALID applies to new writes, while permitting the existing row to remain.
  await pool.query("ALTER TABLE location ADD CONSTRAINT a8_no_writes CHECK (false) NOT VALID");
  try {
    expect(await editLocation(db, actor, child.id, { expectedRevision: 1 })).toEqual(child);
    expect(await editLocation(db, actor, child.id, {
      expectedRevision: 1, name: child.name, description: null, parentLocationId: parent.id.toUpperCase(),
    })).toEqual(child);
  } finally { await pool.query("ALTER TABLE location DROP CONSTRAINT a8_no_writes"); }
  const updated = await editLocation(db, actor, child.id, { expectedRevision: 1, name: "New" });
  await expect(editLocation(db, actor, child.id, { expectedRevision: 1, name: updated.name })).rejects.toBeInstanceOf(LocationRevisionConflictError);
  expect(await getOwnedLocation(db, actor, child.id)).toEqual(updated);
});

test("typed edit failure rolls back revision and updated_at", async () => {
  const child = await create();
  await pool.query("ALTER TABLE location ADD CONSTRAINT a8_reject_edit CHECK (name <> 'Rejected')");
  try {
    await expect(editLocation(db, actor, child.id, { expectedRevision: 1, name: "Rejected" }))
      .rejects.toMatchObject({ cause: { code: "23514", constraint: "a8_reject_edit" } });
    expect(await getOwnedLocation(db, actor, child.id)).toEqual(child);
  } finally { await pool.query("ALTER TABLE location DROP CONSTRAINT a8_reject_edit"); }
});

test("direct and deep cycles are rejected, while unlinking preserves descendants", async () => {
  const root = await create("Root");
  const child = await create("Child", root.id);
  const grandchild = await create("Grandchild", child.id);
  for (const parentLocationId of [root.id, grandchild.id]) {
    await expect(editLocation(db, actor, root.id, { expectedRevision: 1, parentLocationId })).rejects.toBeInstanceOf(InvalidLocationParentError);
  }
  expect(await getOwnedLocation(db, actor, root.id)).toEqual(root);
  await editLocation(db, actor, child.id, { expectedRevision: 1, parentLocationId: null });
  expect(await getOwnedLocation(db, actor, grandchild.id)).toEqual(grandchild);
});

// Hold a real lock until both application transactions are observed waiting.
// This proves overlap without production hooks or timing-only race assumptions.
async function overlap(lockSql: string, id: string, first: () => Promise<unknown>, second: () => Promise<unknown>) {
  const gate = await pool.connect();
  let results: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await gate.query("BEGIN");
    await gate.query(lockSql, [id]);
    results = Promise.allSettled([first(), second()]);
    let waiting = 0;
    const deadline = Date.now() + 2500;
    while (waiting < 2 && Date.now() < deadline) {
      await gate.query("SELECT pg_stat_clear_snapshot()");
      const result = await gate.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE application_name = $1 AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'`, [schema]);
      waiting = result.rows[0].waiting;
      if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(2);
    await gate.query("COMMIT");
    return await results;
  } finally {
    await gate.query("ROLLBACK");
    gate.release();
    await results;
  }
}

test.each([false, true])("overlapping same-revision writers accept exactly one edit (same final state: %s)", async sameState => {
  const child = await create();
  const results = await overlap("SELECT id FROM campaign_entity WHERE id = $1 FOR UPDATE", child.id,
    () => editLocation(db, actor, child.id, { expectedRevision: 1, name: "First" }),
    () => editLocation(db, actor, child.id, { expectedRevision: 1, name: sameState ? "First" : "Second" }));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: expect.any(LocationRevisionConflictError) });
  const accepted = await getOwnedLocation(db, actor, child.id);
  expect(accepted.revision).toBe(2);
  expect(["First", "Second"]).toContain(accepted.name);
});

test("concurrent reciprocal reparenting sees the committed hierarchy and rejects a cycle", async () => {
  const a = await create("A");
  const b = await create("B");
  const results = await overlap("SELECT id FROM campaign WHERE id = $1 FOR UPDATE", campaignId,
    () => editLocation(db, actor, a.id, { expectedRevision: 1, parentLocationId: b.id }),
    () => editLocation(db, actor, b.id, { expectedRevision: 1, parentLocationId: a.id }));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: expect.any(InvalidLocationParentError) });
  const rows = await listOwnedLocations(db, actor, campaignId);
  expect(rows.filter(row => row.parentLocationId !== null)).toHaveLength(1);
  expect(rows.map(row => row.revision).sort()).toEqual([1, 2]);
});

test("name/description edits do not wait for the Campaign hierarchy lock", async () => {
  const child = await create();
  const gate = await pool.connect();
  try {
    await gate.query("BEGIN");
    await gate.query("SELECT id FROM campaign WHERE id = $1 FOR UPDATE", [campaignId]);
    const edited = await editLocation(db, actor, child.id, { expectedRevision: 1, name: "Independent", description: "Notes" });
    expect(edited.revision).toBe(2);
  } finally { await gate.query("ROLLBACK"); gate.release(); }
});

test.each([false, true])("lifecycle transitions/no-ops preserve archive and exact retention (archived: %s)", async archived => {
  const initial = await create();
  expect(await restoreLocation(db, actor, initial.id, 1)).toEqual(initial);
  const beforeTrash = archived ? await archiveLocation(db, actor, initial.id, 1) : initial;
  if (archived) {
    expect(beforeTrash).toMatchObject({ revision: 2, archivedAt: expect.any(Date), deletedAt: null, purgeAfter: null });
    expect(beforeTrash.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime());
    expect(await archiveLocation(db, actor, initial.id, 2)).toEqual(beforeTrash);
    await expect(archiveLocation(db, actor, initial.id, 1)).rejects.toBeInstanceOf(LocationRevisionConflictError);
  }
  const trashed = await trashLocation(db, actor, initial.id, beforeTrash.revision);
  expect(trashed.revision).toBe(beforeTrash.revision + 1);
  expect(trashed.updatedAt.getTime()).toBeGreaterThan(beforeTrash.updatedAt.getTime());
  expect(trashed.archivedAt).toEqual(beforeTrash.archivedAt);
  expect(trashed.purgeAfter!.getTime() - trashed.deletedAt!.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  expect((await pool.query("SELECT extract(epoch FROM (purge_after - deleted_at)) AS seconds FROM campaign_entity WHERE id = $1", [initial.id])).rows[0].seconds).toBe("2592000.000000");
  expect(await trashLocation(db, actor, initial.id, trashed.revision)).toEqual(trashed);
  for (const command of [archiveLocation, trashLocation, restoreLocation]) {
    await expect(command(db, actor, initial.id, beforeTrash.revision)).rejects.toBeInstanceOf(LocationRevisionConflictError);
  }
  expect(await listOwnedLocations(db, actor, campaignId)).toEqual([trashed]);
  const restored = await restoreLocation(db, actor, initial.id, trashed.revision);
  expect(restored).toMatchObject({ deletedAt: null, purgeAfter: null, archivedAt: beforeTrash.archivedAt, revision: trashed.revision + 1 });
  expect(restored.updatedAt.getTime()).toBeGreaterThan(trashed.updatedAt.getTime());
  expect(await restoreLocation(db, actor, initial.id, restored.revision)).toEqual(restored);
  await expect(restoreLocation(db, actor, initial.id, trashed.revision)).rejects.toBeInstanceOf(LocationRevisionConflictError);
});
