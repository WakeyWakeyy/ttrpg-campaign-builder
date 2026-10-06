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

async function campaign(executor = client) {
  const user = (await executor.query("INSERT INTO user_account DEFAULT VALUES RETURNING id")).rows[0].id as string;
  const row = (await executor.query("INSERT INTO campaign (owner_user_id, name) VALUES ($1, 'A4') RETURNING id", [user])).rows[0];
  return { id: row.id as string, user };
}

// Persistence protocol fixtures, not application commands. The complete use case
// must own this executor's transaction, authorization and hierarchy validation.
async function createLocation(scope: { id: string; user: string }, parent: string | null = null, executor = client) {
  const entity = (await executor.query(`INSERT INTO campaign_entity (campaign_id, entity_type, created_by_user_id)
    VALUES ($1, 'LOCATION', $2) RETURNING *`, [scope.id, scope.user])).rows[0];
  await executor.query("INSERT INTO location (id, campaign_id, name, parent_location_id) VALUES ($1, $2, 'Harbor', $3)", [entity.id, scope.id, parent]);
  return entity;
}

async function editLocation(executor: PoolClient, campaignId: string, id: string, expected_revision: number, name: string) {
  // Claim the revision before touching typed data. PostgreSQL rechecks the
  // predicate after waiting for a concurrent writer at READ COMMITTED.
  const result = await executor.query(`UPDATE campaign_entity SET revision = revision + 1, updated_at = clock_timestamp()
    WHERE campaign_id = $1 AND id = $2 AND revision = $3 RETURNING revision`, [campaignId, id, expected_revision]);
  if (!result.rowCount) throw new Error("Revision conflict");
  const typed = await executor.query("UPDATE location SET name = $3 WHERE campaign_id = $1 AND id = $2", [campaignId, id, name]);
  if (typed.rowCount !== 1) throw new Error("Missing Location subtype");
  return result.rows[0].revision;
}

async function violation(query: string, values: unknown[], code: string, constraint?: string) {
  await client.query("SAVEPOINT invalid_write");
  await expect(client.query(query, values)).rejects.toMatchObject({ code, ...(constraint ? { constraint } : {}) });
  await client.query("ROLLBACK TO SAVEPOINT invalid_write");
}

test("shared UUIDv7 identity, defaults and internal creator provenance", async () => {
  const scope = await campaign();
  const entity = await createLocation(scope);
  const typed = (await client.query("SELECT * FROM location WHERE id = $1", [entity.id])).rows[0];
  expect(typed).toEqual({ id: entity.id, campaign_id: scope.id, entity_type: 'LOCATION', name: 'Harbor', description: null, parent_location_id: null });
  expect(entity).toMatchObject({ entity_type: 'LOCATION', revision: 1, created_by_user_id: scope.user, archived_at: null, deleted_at: null, purge_after: null });
  expect(entity.created_at).toBeInstanceOf(Date);
  expect(entity.updated_at).toEqual(entity.created_at);
  expect((await client.query("SELECT uuid_extract_version($1::uuid) AS version", [entity.id])).rows[0].version).toBe(7);
  expect((await createLocation(scope)).id).not.toBe(entity.id); // Names are not identities.
  await violation("UPDATE campaign_entity SET created_by_user_id = $2 WHERE id = $1", [entity.id, randomUUID()], '23503');
  await violation("UPDATE campaign_entity SET created_by_user_id = 'clerk_external' WHERE id = $1", [entity.id], '22P02');
  await violation("UPDATE campaign_entity SET entity_type = 'UNKNOWN' WHERE id = $1", [entity.id], '23514', 'campaign_entity_type_check');
  for (const revision of [0, -1]) {
    await violation("UPDATE campaign_entity SET revision = $2 WHERE id = $1", [entity.id, revision], '23514', 'campaign_entity_revision_positive');
  }
});

test("composite keys reject cross-Campaign subtypes and parents on insert and update", async () => {
  const a = await campaign();
  const b = await campaign();
  const first = await createLocation(a);
  const second = await createLocation(b);
  await violation("INSERT INTO location (id, campaign_id, name) VALUES ($1, $2, 'Missing')", [randomUUID(), a.id], '23503', 'location_campaign_entity_fk');
  const registry = (await client.query("INSERT INTO campaign_entity (campaign_id, entity_type, created_by_user_id) VALUES ($1, 'LOCATION', $2) RETURNING id", [a.id, a.user])).rows[0];
  await violation("INSERT INTO location (id, campaign_id, name) VALUES ($1, $2, 'Wrong scope')", [registry.id, b.id], '23503', 'location_campaign_entity_fk');
  await violation("INSERT INTO location (id, campaign_id, name, parent_location_id) VALUES ($1, $2, 'Wrong parent', $3)", [registry.id, a.id, second.id], '23503', 'location_parent_same_campaign_fk');
  await violation("UPDATE location SET campaign_id = $2 WHERE id = $1", [first.id, b.id], '23503', 'location_campaign_entity_fk');
  await violation("UPDATE location SET parent_location_id = $2 WHERE id = $1", [first.id, second.id], '23503', 'location_parent_same_campaign_fk');
  await violation("UPDATE location SET parent_location_id = id WHERE id = $1", [first.id], '23514', 'location_parent_not_self');
  await violation("UPDATE campaign_entity SET campaign_id = $2 WHERE id = $1", [first.id, b.id], '23503', 'location_campaign_entity_fk');
  await violation("INSERT INTO location (id, campaign_id, name) VALUES ($1, $2, 'Duplicate')", [first.id, a.id], '23505', 'location_pkey');
});

test("failed subtype creation rolls back its registry row with the transaction", async () => {
  // Real BEGIN/ROLLBACK, independent of the suite's enclosing fixture transaction.
  const executor = await pool.connect();
  let id: string | undefined;
  try {
    await executor.query("BEGIN");
    const scope = await campaign(executor);
    id = (await executor.query("INSERT INTO campaign_entity (campaign_id, entity_type, created_by_user_id) VALUES ($1, 'LOCATION', $2) RETURNING id", [scope.id, scope.user])).rows[0].id;
    await expect(executor.query("INSERT INTO location (id, campaign_id, name) VALUES ($1, $2, NULL)", [id, scope.id])).rejects.toMatchObject({ code: '23502' });
    await executor.query("ROLLBACK");
    for (const table of ['campaign_entity', 'location']) {
      expect((await pool.query(`SELECT id FROM ${table} WHERE id = $1`, [id])).rows).toHaveLength(0);
    }
  } finally {
    await executor.query("ROLLBACK");
    executor.release();
  }
});

test("revision-safe edits reject stale writes and roll back revision claims on typed failure", async () => {
  const scope = await campaign();
  const entity = await createLocation(scope);
  expect(await editLocation(client, scope.id, entity.id, 1, 'New Harbor')).toBe(2);
  await expect(editLocation(client, scope.id, entity.id, 1, 'Stale Harbor')).rejects.toThrow('Revision conflict');
  await expect(editLocation(client, randomUUID(), entity.id, 2, 'Wrong scope')).rejects.toThrow('Revision conflict');
  await client.query("SAVEPOINT failed_edit");
  await expect(editLocation(client, scope.id, entity.id, 2, null as unknown as string)).rejects.toMatchObject({ code: '23502' });
  await client.query("ROLLBACK TO SAVEPOINT failed_edit");
  const row = (await client.query("SELECT e.*, l.name FROM campaign_entity e JOIN location l USING (id, campaign_id) WHERE e.id = $1", [entity.id])).rows[0];
  expect(row).toMatchObject({ revision: 2, name: 'New Harbor', created_at: entity.created_at, created_by_user_id: scope.user });
  expect(row.updated_at.getTime()).toBeGreaterThanOrEqual(entity.updated_at.getTime());
});

test("concurrent edits with the same expected revision accept exactly one writer", async () => {
  const first = await pool.connect();
  const second = await pool.connect();
  let scope: { id: string; user: string } | undefined;
  try {
    await first.query("BEGIN");
    scope = await campaign(first);
    const entity = await createLocation(scope, null, first);
    await first.query("COMMIT");
    // Successful two-row creation is visible from another connection.
    expect((await second.query("SELECT l.id FROM location l JOIN campaign_entity e USING (id, campaign_id) WHERE l.id = $1", [entity.id])).rowCount).toBe(1);
    await first.query("BEGIN");
    await second.query("BEGIN");
    await second.query("SET LOCAL lock_timeout = '5s'");
    const secondPid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
    expect(await editLocation(first, scope.id, entity.id, 1, 'Winner')).toBe(2);
    const loser = editLocation(second, scope.id, entity.id, 1, 'Loser').then(
      () => 'unexpected success', (error: Error) => error.message,
    );
    // Prove overlap rather than accidentally testing two sequential edits.
    let blocked = false;
    const deadline = Date.now() + 3000;
    while (!blocked && Date.now() < deadline) {
      blocked = (await first.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [secondPid])).rows[0].blocked;
      if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
    await first.query("COMMIT");
    expect(await loser).toBe('Revision conflict');
    await second.query("ROLLBACK");
    expect((await first.query("SELECT revision, name FROM campaign_entity JOIN location USING (id, campaign_id) WHERE id = $1", [entity.id])).rows[0]).toEqual({ revision: 2, name: 'Winner' });
  } finally {
    await first.query("ROLLBACK");
    await second.query("ROLLBACK");
    if (scope) {
      await first.query("DELETE FROM campaign WHERE id = $1", [scope.id]);
      await first.query("DELETE FROM user_account WHERE id = $1", [scope.user]);
    }
    first.release();
    second.release();
  }
});

test("Archive, Trash and Restore preserve archive state and exact 30-day retention across DST", async () => {
  await client.query("SET LOCAL TIME ZONE 'America/New_York'");
  const entity = await createLocation(await campaign());
  for (const archived of [null, new Date('2026-02-01T12:00:00Z')]) {
    await client.query("UPDATE campaign_entity SET archived_at = $2 WHERE id = $1", [entity.id, archived]);
    expect((await client.query("SELECT purge_after FROM campaign_entity WHERE id = $1", [entity.id])).rows[0].purge_after).toBeNull();
    await client.query("UPDATE campaign_entity SET deleted_at = '2026-03-01T12:00:00Z', purge_after = '2026-03-31T12:00:00Z' WHERE id = $1", [entity.id]);
    const restored = (await client.query("UPDATE campaign_entity SET deleted_at = NULL, purge_after = NULL WHERE id = $1 RETURNING *", [entity.id])).rows[0];
    expect(restored.archived_at).toEqual(archived);
    expect((await client.query("SELECT id FROM location WHERE id = $1", [entity.id])).rowCount).toBe(1);
  }
});

test.each([
  [null, '2026-03-31T12:00:00Z'], ['2026-03-01T12:00:00Z', null],
  ['2026-03-01T12:00:00Z', '2026-03-30T12:00:00Z'],
  ['2026-03-01T12:00:00Z', '2026-04-01T12:00:00Z'],
  ['2026-03-01T12:00:00Z', '2026-03-31T11:00:00Z'], ['infinity', 'infinity'],
])("rejects invalid entity Trash retention %s / %s", async (deleted, purge) => {
  const entity = await createLocation(await campaign());
  await violation("UPDATE campaign_entity SET deleted_at = $2, purge_after = $3 WHERE id = $1", [entity.id, deleted, purge], '23514', 'campaign_entity_trash_retention_check');
});

test("parent purge cannot delete children; unlinking preserves identity; whole Campaign deletion cascades", async () => {
  const scope = await campaign();
  const parent = await createLocation(scope);
  const child = await createLocation(scope, parent.id);
  const grandchild = await createLocation(scope, child.id);
  await violation("DELETE FROM campaign_entity WHERE id = $1", [parent.id], '23503', 'location_parent_same_campaign_fk');
  await client.query("UPDATE location SET parent_location_id = NULL WHERE id = $1", [child.id]);
  await client.query("DELETE FROM campaign_entity WHERE id = $1", [parent.id]);
  expect((await client.query("SELECT id FROM location WHERE id = $1", [child.id])).rowCount).toBe(1);
  expect((await client.query("SELECT id FROM location WHERE id = $1", [parent.id])).rowCount).toBe(0);
  await client.query("DELETE FROM campaign WHERE id = $1", [scope.id]);
  for (const table of ['campaign_entity', 'location']) {
    expect((await client.query(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`, [[child.id, grandchild.id]])).rows).toHaveLength(0);
  }
  expect((await client.query("SELECT id FROM user_account WHERE id = $1", [scope.user])).rowCount).toBe(1);
});

test.each([false, true])("A4 migration replay from empty schema (existing A1/A2/A3 data: %s)", async (upgrade) => {
  const schema = `a4_migration_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}", public`);
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as { entries: { tag: string }[] };
  let existing: { id: string; user: string } | undefined;
  for (const entry of journal.entries) {
    if (upgrade && entry.tag === '0003_campaign_entity_location') {
      existing = await campaign();
      await client.query("INSERT INTO auth_identity (user_id, provider, provider_subject) VALUES ($1, 'test', 'pre-a4')", [existing.user]);
      await client.query("INSERT INTO campaign_ruleset (campaign_id, ruleset_id, ruleset_version_id) SELECT $1, ruleset_id, id FROM ruleset_version LIMIT 1", [existing.id]);
      await client.query("INSERT INTO campaign_compass (campaign_id, original_premise, current_premise) VALUES ($1, 'Original', 'Current')", [existing.id]);
      await client.query("UPDATE campaign SET archived_at = now(), deleted_at = '2026-03-01T12:00:00Z', purge_after = '2026-03-31T12:00:00Z' WHERE id = $1", [existing.id]);
    }
    const migration = (await readFile(`drizzle/${entry.tag}.sql`, 'utf8')).replaceAll('"public".', `"${schema}".`);
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.query(statement);
    }
  }
  const scope = existing ?? await campaign();
  const entity = await createLocation(scope);
  expect(await editLocation(client, scope.id, entity.id, 1, 'Migrated Harbor')).toBe(2);
  if (existing) {
    expect((await client.query("SELECT user_id FROM auth_identity WHERE provider_subject = 'pre-a4'")).rows[0].user_id).toBe(existing.user);
    expect((await client.query("SELECT original_premise FROM campaign_compass WHERE campaign_id = $1", [existing.id])).rows[0].original_premise).toBe('Original');
    expect((await client.query("SELECT * FROM campaign_ruleset WHERE campaign_id = $1", [existing.id])).rowCount).toBe(1);
    const row = (await client.query("SELECT * FROM campaign WHERE id = $1", [existing.id])).rows[0];
    expect(row.archived_at).toBeInstanceOf(Date);
    expect(row.purge_after.getTime() - row.deleted_at.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  }
});
