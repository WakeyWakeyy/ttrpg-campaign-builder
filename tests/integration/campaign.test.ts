import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
let client: PoolClient;
beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
});
afterEach(async () => {
  try { await client.query("ROLLBACK"); } finally { client.release(); }
});
afterAll(async () => { await pool.end(); });

async function owner() {
  return (await client.query("INSERT INTO user_account DEFAULT VALUES RETURNING id")).rows[0].id as string;
}
async function campaign(ownerId?: string) {
  return (await client.query("INSERT INTO campaign (owner_user_id, name) VALUES ($1, 'Same name') RETURNING *", [ownerId ?? await owner()])).rows[0];
}
async function pin(campaignId: string) {
  const family = (await client.query("INSERT INTO ruleset (key, name) VALUES ($1, 'Test') RETURNING id", [randomUUID()])).rows[0].id;
  const version = (await client.query("INSERT INTO ruleset_version (ruleset_id, version, name) VALUES ($1, '1', 'Test') RETURNING id", [family])).rows[0].id;
  await client.query("INSERT INTO campaign_ruleset (campaign_id, ruleset_id, ruleset_version_id) VALUES ($1, $2, $3)", [campaignId, family, version]);
  return { family, version };
}
async function violation(query: string, values: unknown[], code: string, constraint?: string) {
  await client.query("SAVEPOINT invalid_write");
  await expect(client.query(query, values)).rejects.toMatchObject({ code, ...(constraint ? { constraint } : {}) });
  await client.query("ROLLBACK TO SAVEPOINT invalid_write");
}

test("internal ownership, UUIDv7 defaults, nullable fields and non-unique names", async () => {
  const user = await owner();
  await client.query("INSERT INTO auth_identity (user_id, provider, provider_subject) VALUES ($1, 'clerk', 'user_external')", [user]);
  const first = await campaign(user);
  const second = await campaign(user);
  expect(first.id).not.toBe(second.id);
  expect(first).toMatchObject({ owner_user_id: user, description: null, archived_at: null, deleted_at: null, purge_after: null });
  expect(first.created_at).toBeInstanceOf(Date);
  expect(first.updated_at).toEqual(first.created_at);
  const guideline = (await client.query("INSERT INTO campaign_compass_guideline (campaign_id, kind, title, description) VALUES ($1, 'theme', 'Title', 'Description') RETURNING *", [first.id])).rows[0];
  expect(guideline.sort_order).toBeNull();
  for (const id of [first.id, guideline.id]) {
    expect((await client.query("SELECT uuid_extract_version($1::uuid) AS version", [id])).rows[0].version).toBe(7);
  }
  const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign'")).rows.map(row => row.column_name);
  expect(columns.sort()).toEqual(['id', 'owner_user_id', 'name', 'description', 'created_at', 'updated_at', 'archived_at', 'deleted_at', 'purge_after'].sort());
  await violation("INSERT INTO campaign (owner_user_id, name) VALUES ($1, 'Missing')", [randomUUID()], '23503', 'campaign_owner_user_id_user_account_id_fk');
  await violation("INSERT INTO campaign (owner_user_id, name) VALUES ('user_external', 'External')", [], '22P02');
  await violation("DELETE FROM user_account WHERE id = $1", [user], '23001', 'campaign_owner_user_id_user_account_id_fk');
});

test("Archive, Trash and Restore retain independent archive state across DST", async () => {
  await client.query("SET LOCAL TIME ZONE 'America/New_York'");
  const row = await campaign();
  const archived = new Date('2026-02-01T12:00:00Z');
  await client.query("UPDATE campaign SET archived_at = $2 WHERE id = $1", [row.id, archived]);
  for (const archive of [null, archived]) {
    await client.query("UPDATE campaign SET archived_at = $2, deleted_at = '2026-03-01T12:00:00Z', purge_after = '2026-03-31T12:00:00Z' WHERE id = $1", [row.id, archive]);
    const restored = (await client.query("UPDATE campaign SET deleted_at = NULL, purge_after = NULL WHERE id = $1 RETURNING *", [row.id])).rows[0];
    expect(restored.archived_at).toEqual(archive);
    expect(restored.updated_at).toEqual(row.updated_at);
  }
});

test.each([
  [null, '2026-03-31T12:00:00Z'],
  ['2026-03-01T12:00:00Z', null],
  ['2026-03-01T12:00:00Z', '2026-03-30T12:00:00Z'],
  ['2026-03-01T12:00:00Z', '2026-04-01T12:00:00Z'],
  ['2026-03-01T12:00:00Z', '2026-03-31T11:00:00Z'],
  ['infinity', 'infinity'],
])("rejects invalid Trash retention %s / %s", async (deleted, purge) => {
  const row = await campaign();
  await violation("UPDATE campaign SET deleted_at = $2, purge_after = $3 WHERE id = $1", [row.id, deleted, purge], '23514', 'campaign_trash_retention_check');
});

test("one Ruleset pin per Campaign enforces composite agreement and restricts metadata deletion", async () => {
  const row = await campaign();
  const { family, version } = await pin(row.id);
  expect((await client.query("SELECT pinned_at FROM campaign_ruleset WHERE campaign_id = $1", [row.id])).rows[0].pinned_at).toBeInstanceOf(Date);
  await violation("INSERT INTO campaign_ruleset (campaign_id, ruleset_id, ruleset_version_id) VALUES ($1, $2, $3)", [row.id, family, version], '23505', 'campaign_ruleset_pkey');
  const other = await campaign();
  const otherPin = await pin(other.id);
  await violation("UPDATE campaign_ruleset SET ruleset_id = $2 WHERE campaign_id = $1", [row.id, otherPin.family], '23503', 'campaign_ruleset_version_fk');
  await violation("DELETE FROM ruleset_version WHERE id = $1", [version], '23001', 'campaign_ruleset_version_fk');
  await violation("DELETE FROM ruleset WHERE id = $1", [family], '23001', 'ruleset_version_ruleset_id_ruleset_id_fk');
});

test("Compass defaults, positive revisions, one-to-one cardinality and preserved initial text", async () => {
  const row = await campaign();
  const compass = (await client.query("INSERT INTO campaign_compass (campaign_id, original_premise, current_premise, original_notes) VALUES ($1, 'Original', 'Current', 'Notes') RETURNING *", [row.id])).rows[0];
  expect(compass).toMatchObject({ revision: 1, setting: null, tone: null, original_notes: 'Notes' });
  expect(compass.created_at).toBeInstanceOf(Date);
  expect(compass.updated_at).toEqual(compass.created_at);
  await violation("INSERT INTO campaign_compass (campaign_id, original_premise, current_premise) VALUES ($1, 'x', 'y')", [row.id], '23505', 'campaign_compass_pkey');
  for (const revision of [0, -1]) {
    await violation("UPDATE campaign_compass SET revision = $2 WHERE campaign_id = $1", [row.id, revision], '23514', 'campaign_compass_revision_positive');
  }
  const edited = (await client.query("UPDATE campaign_compass SET current_premise = 'Edited', revision = 2 WHERE campaign_id = $1 RETURNING *", [row.id])).rows[0];
  expect(edited).toMatchObject({ original_premise: 'Original', original_notes: 'Notes', revision: 2, updated_at: compass.updated_at });
});

test("guideline kinds and physical purge cascade only to Campaign-owned rows", async () => {
  const row = await campaign();
  const { family, version } = await pin(row.id);
  await client.query("INSERT INTO campaign_compass (campaign_id, original_premise, current_premise) VALUES ($1, 'Original', 'Current')", [row.id]);
  for (const kind of ['theme', 'gm_priority', 'boundary', 'style', 'other']) {
    await client.query("INSERT INTO campaign_compass_guideline (campaign_id, kind, title, description) VALUES ($1, $2, 'Title', 'Description')", [row.id, kind]);
  }
  await violation("INSERT INTO campaign_compass_guideline (campaign_id, kind, title, description) VALUES ($1, 'unknown', 'Title', 'Description')", [row.id], '23514', 'campaign_compass_guideline_kind_check');
  await client.query("DELETE FROM campaign WHERE id = $1", [row.id]);
  for (const table of ['campaign_ruleset', 'campaign_compass', 'campaign_compass_guideline']) {
    expect((await client.query(`SELECT * FROM ${table} WHERE campaign_id = $1`, [row.id])).rows).toHaveLength(0);
  }
  for (const [table, id] of [['user_account', row.owner_user_id], ['ruleset', family], ['ruleset_version', version]]) {
    expect((await client.query(`SELECT id FROM ${table} WHERE id = $1`, [id])).rows).toHaveLength(1);
  }
});

// Replay committed SQL in an empty, transaction-owned schema. Only public schema
// qualifiers are redirected; SQL statements and seeded data remain unchanged.
test.each([false, true])("committed migrations apply from empty schema (A1/A2 fixture: %s)", async (upgrade) => {
  const schema = `a3_migration_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}", public`);
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as { entries: { tag: string }[] };
  let existingOwner: string | undefined;
  for (const entry of journal.entries) {
    if (upgrade && entry.tag === '0002_campaign_root') {
      existingOwner = await owner();
      await client.query("INSERT INTO auth_identity (user_id, provider, provider_subject) VALUES ($1, 'test', 'pre-a3')", [existingOwner]);
    }
    const migration = (await readFile(`drizzle/${entry.tag}.sql`, 'utf8')).replaceAll('"public".', `"${schema}".`);
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.query(statement);
    }
  }
  expect(Number((await client.query('SHOW server_version_num')).rows[0].server_version_num)).toBeGreaterThanOrEqual(180000);
  const row = await campaign(existingOwner);
  const seeded = (await client.query("SELECT v.id, v.ruleset_id FROM ruleset_version v JOIN ruleset r ON r.id = v.ruleset_id WHERE r.key = 'dnd-5e-2024' AND v.version = '5.2.1'")).rows[0];
  await client.query("INSERT INTO campaign_ruleset (campaign_id, ruleset_id, ruleset_version_id) VALUES ($1, $2, $3)", [row.id, seeded.ruleset_id, seeded.id]);
  if (upgrade) expect((await client.query("SELECT user_id FROM auth_identity WHERE provider_subject = 'pre-a3'")).rows[0].user_id).toBe(row.owner_user_id);
});
