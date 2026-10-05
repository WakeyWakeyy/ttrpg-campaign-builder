import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
let client: PoolClient;
beforeEach(async () => { client = await pool.connect(); await client.query("BEGIN"); });
afterEach(async () => { try { await client.query("ROLLBACK"); } finally { client.release(); } });
afterAll(async () => { await pool.end(); });

async function user() {
  return (await client.query("INSERT INTO user_account DEFAULT VALUES RETURNING id")).rows[0].id as string;
}
async function scope(owner?: string) {
  const userId = owner ?? await user();
  const id = (await client.query("INSERT INTO campaign (owner_user_id, name) VALUES ($1, 'A5') RETURNING id", [userId])).rows[0].id as string;
  return { id, user: userId };
}
async function command(userId: string, campaignId: string | null = null, kind = 'IMPORT') {
  return (await client.query(`INSERT INTO command_execution
    (scope_user_id, scope_campaign_id, command_kind, idempotency_key, request_fingerprint, status)
    VALUES ($1, $2, $3, 'retry-key', 'fingerprint', 'IN_PROGRESS') RETURNING *`, [userId, campaignId, kind])).rows[0];
}
async function change(campaignId: string, userId: string) {
  return (await client.query("INSERT INTO change_set (campaign_id, created_by_user_id, kind) VALUES ($1, $2, 'IMPORT') RETURNING *", [campaignId, userId])).rows[0];
}
async function entry(changeId: string, order = 1) {
  return (await client.query(`INSERT INTO change_set_entry (change_set_id, entity_id, object_kind, operation, after_json, apply_order)
    VALUES ($1, $2, 'LOCATION', 'INSERT', '{"name":"Harbor"}', $3) RETURNING *`, [changeId, randomUUID(), order])).rows[0];
}
async function violation(query: string, values: unknown[], code: string, constraint?: string) {
  await client.query("SAVEPOINT invalid_write");
  await expect(client.query(query, values)).rejects.toMatchObject({ code, ...(constraint ? { constraint } : {}) });
  await client.query("ROLLBACK TO SAVEPOINT invalid_write");
}

test("idempotency separates user, campaign and command kind with two partial unique indexes", async () => {
  const a = await scope();
  const b = await scope(a.user);
  const other = await user();
  await command(a.user);
  await violation(`INSERT INTO command_execution (scope_user_id, command_kind, idempotency_key, request_fingerprint, status)
    VALUES ($1, 'IMPORT', 'retry-key', 'different-fingerprint', 'IN_PROGRESS')`, [a.user], '23505', 'command_execution_user_idempotency_unique');
  await command(other);
  await command(a.user, null, 'BULK');
  await command(a.user, a.id);
  await violation(`INSERT INTO command_execution (scope_user_id, scope_campaign_id, command_kind, idempotency_key, request_fingerprint, status)
    VALUES ($1, $2, 'IMPORT', 'retry-key', 'fingerprint', 'IN_PROGRESS')`, [a.user, a.id], '23505', 'command_execution_campaign_idempotency_unique');
  await command(a.user, b.id);
  await command(other, a.id);
  await command(a.user, a.id, 'BULK');
  expect((await client.query("SELECT count(*)::int AS count FROM command_execution WHERE scope_user_id = ANY($1::uuid[])", [[a.user, other]])).rows[0].count).toBe(7);
});

test("command defaults, completion transitions, schema versions and required text", async () => {
  const row = await command(await user());
  expect(row).toMatchObject({ status: 'IN_PROGRESS', completed_at: null, result_schema_version: null, result_json: null });
  expect(row.created_at).toBeInstanceOf(Date);
  await violation("UPDATE command_execution SET status = 'FAILED' WHERE id = $1", [row.id], '23514');
  await violation("UPDATE command_execution SET status = 'SUCCEEDED' WHERE id = $1", [row.id], '23514', 'command_execution_completion_check');
  await violation("UPDATE command_execution SET completed_at = now() WHERE id = $1", [row.id], '23514', 'command_execution_completion_check');
  await client.query("UPDATE command_execution SET status = 'SUCCEEDED', completed_at = now(), result_schema_version = 1, result_json = '{\"id\":1}' WHERE id = $1", [row.id]);
  await violation("UPDATE command_execution SET completed_at = NULL WHERE id = $1", [row.id], '23514', 'command_execution_completion_check');
  for (const value of [0, -1]) await violation("UPDATE command_execution SET result_schema_version = $2 WHERE id = $1", [row.id, value], '23514', 'command_execution_result_schema_version_positive');
  for (const column of ['command_kind', 'idempotency_key', 'request_fingerprint']) {
    for (const value of ['', '   ']) await violation(`UPDATE command_execution SET ${column} = $2 WHERE id = $1`, [row.id, value], '23514', `command_execution_${column}_nonempty`);
  }
});

test("command scope foreign keys and restrictive deletion preserve scope", async () => {
  const a = await scope();
  const actor = await user();
  const row = await command(actor, a.id);
  for (const column of ['scope_user_id', 'scope_campaign_id']) await violation(`UPDATE command_execution SET ${column} = $2 WHERE id = $1`, [row.id, randomUUID()], '23503');
  await violation("DELETE FROM user_account WHERE id = $1", [actor], '23001', 'command_execution_scope_user_id_user_account_id_fk');
  await violation("DELETE FROM campaign WHERE id = $1", [a.id], '23001', 'command_execution_scope_campaign_id_campaign_id_fk');
});

test("Change Set provenance, reversion pair and foreign keys", async () => {
  const a = await scope();
  const creator = await user();
  const reverter = await user();
  const row = await change(a.id, creator);
  expect(row).toMatchObject({ reverted_at: null, reverted_by_user_id: null });
  expect(row.created_at).toBeInstanceOf(Date);
  for (const column of ['campaign_id', 'created_by_user_id']) await violation(`UPDATE change_set SET ${column} = $2 WHERE id = $1`, [row.id, randomUUID()], '23503');
  await violation("UPDATE change_set SET reverted_at = now(), reverted_by_user_id = $2 WHERE id = $1", [row.id, randomUUID()], '23503');
  await violation("UPDATE change_set SET reverted_at = now() WHERE id = $1", [row.id], '23514', 'change_set_reverted_pair_check');
  await violation("UPDATE change_set SET reverted_by_user_id = $2 WHERE id = $1", [row.id, reverter], '23514', 'change_set_reverted_pair_check');
  for (const kind of ['', '   ']) await violation("UPDATE change_set SET kind = $2 WHERE id = $1", [row.id, kind], '23514', 'change_set_kind_nonempty');
  await client.query("UPDATE change_set SET reverted_at = now(), reverted_by_user_id = $2 WHERE id = $1", [row.id, reverter]);
  await violation("DELETE FROM user_account WHERE id = $1", [creator], '23001', 'change_set_created_by_user_id_user_account_id_fk');
  await violation("DELETE FROM user_account WHERE id = $1", [reverter], '23001', 'change_set_reverted_by_user_id_user_account_id_fk');
});

test.each(['INSERT', 'UPDATE', 'DELETE', 'UNKNOWN'])("enforces all snapshot presence combinations for %s", async operation => {
  const a = await scope();
  const row = await entry((await change(a.id, a.user)).id);
  for (const before of [null, '{}']) for (const after of [null, '{}']) {
    const query = "UPDATE change_set_entry SET operation = $2, before_json = $3, after_json = $4 WHERE id = $1";
    const values = [row.id, operation, before, after];
    const valid = (operation === 'INSERT' && before === null && after !== null)
      || (operation === 'UPDATE' && before !== null && after !== null)
      || (operation === 'DELETE' && before !== null && after === null);
    if (valid) await client.query(query, values);
    else await violation(query, values, '23514', 'change_set_entry_operation_snapshot_check');
  }
});

test.each(['null', '[]', '"text"', '1', 'true'])("rejects non-object JSON snapshots %s", async value => {
  const a = await scope();
  const row = await entry((await change(a.id, a.user)).id);
  await client.query("UPDATE change_set_entry SET operation = 'UPDATE', before_json = '{}' WHERE id = $1", [row.id]);
  for (const column of ['before_json', 'after_json']) await violation(`UPDATE change_set_entry SET ${column} = $2 WHERE id = $1`, [row.id, value], '23514', `change_set_entry_${column === 'before_json' ? 'before' : 'after'}_object_check`);
});

test("entry identity, positive numbers, ordering uniqueness and parent foreign key", async () => {
  const a = await scope();
  const first = await change(a.id, a.user);
  const second = await change(a.id, a.user);
  const row = await entry(first.id);
  expect(row).toMatchObject({ snapshot_schema_version: 1, expected_current_revision: null, object_id: null });
  for (const column of ['snapshot_schema_version', 'expected_current_revision', 'apply_order']) {
    for (const value of [0, -1]) await violation(`UPDATE change_set_entry SET ${column} = $2 WHERE id = $1`, [row.id, value], '23514', `change_set_entry_${column}_positive`);
  }
  await client.query("UPDATE change_set_entry SET expected_current_revision = 2 WHERE id = $1", [row.id]);
  for (const value of ['', '   ']) await violation("UPDATE change_set_entry SET object_kind = $2 WHERE id = $1", [row.id, value], '23514', 'change_set_entry_object_kind_nonempty');
  await violation("UPDATE change_set_entry SET entity_id = NULL WHERE id = $1", [row.id], '23514', 'change_set_entry_object_identity_check');
  await violation("UPDATE change_set_entry SET change_set_id = $2 WHERE id = $1", [row.id, randomUUID()], '23503');
  const later = await entry(first.id, 2);
  await violation("UPDATE change_set_entry SET apply_order = 1 WHERE id = $1", [later.id], '23505', 'change_set_entry_apply_order_unique');
  await entry(second.id, 1);
  // Neither identity requires a live row; both may also be supplied together.
  await client.query("UPDATE change_set_entry SET object_id = $2 WHERE id = $1", [row.id, randomUUID()]);
  await client.query("UPDATE change_set_entry SET entity_id = NULL WHERE id = $1", [row.id]);
  for (const id of [first.id, row.id, (await command(a.user)).id]) {
    expect((await client.query("SELECT uuid_extract_version($1::uuid) AS version", [id])).rows[0].version).toBe(7);
  }
});

test.each(['change_set', 'campaign'])("deleting %s cascades technical entries", async table => {
  const a = await scope();
  const set = await change(a.id, a.user);
  const row = await entry(set.id);
  await client.query(`DELETE FROM ${table} WHERE id = $1`, [table === 'campaign' ? a.id : set.id]);
  expect((await client.query("SELECT id FROM change_set WHERE id = $1", [set.id])).rowCount).toBe(0);
  expect((await client.query("SELECT id FROM change_set_entry WHERE id = $1", [row.id])).rowCount).toBe(0);
  expect((await client.query("SELECT id FROM user_account WHERE id = $1", [a.user])).rowCount).toBe(1);
});

test.each([false, true])("A5 migration replay on PostgreSQL 18 (preserving A1-A4 data: %s)", async upgrade => {
  const version = (await client.query("SHOW server_version_num")).rows[0].server_version_num;
  expect(Number(version)).toBeGreaterThanOrEqual(180000);
  expect(Number(version)).toBeLessThan(190000);
  const schema = `a5_migration_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}", public`);
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as { entries: { tag: string }[] };
  const tables = ['user_account', 'auth_identity', 'ruleset', 'ruleset_version', 'ruleset_content_source', 'campaign', 'campaign_ruleset', 'campaign_compass', 'campaign_compass_guideline', 'campaign_entity', 'location'];
  const snapshots = new Map<string, unknown[]>();
  for (const migration of journal.entries) {
    if (upgrade && migration.tag === '0004_technical_operation_safety') {
      const a = await scope();
      await client.query("INSERT INTO auth_identity (user_id, provider, provider_subject) VALUES ($1, 'test', 'pre-a5')", [a.user]);
      await client.query("INSERT INTO campaign_ruleset (campaign_id, ruleset_id, ruleset_version_id) SELECT $1, ruleset_id, id FROM ruleset_version LIMIT 1", [a.id]);
      await client.query("INSERT INTO campaign_compass (campaign_id, original_premise, current_premise, revision) VALUES ($1, 'Original', 'Edited', 3)", [a.id]);
      await client.query("INSERT INTO campaign_compass_guideline (campaign_id, kind, title, description) VALUES ($1, 'theme', 'Hope', 'Preserved')", [a.id]);
      const entity = (await client.query(`INSERT INTO campaign_entity (campaign_id, entity_type, created_by_user_id, revision, archived_at, deleted_at, purge_after)
        VALUES ($1, 'LOCATION', $2, 4, '2026-02-01', '2026-03-01', '2026-03-31') RETURNING id`, [a.id, a.user])).rows[0];
      await client.query("INSERT INTO location (id, campaign_id, name, description) VALUES ($1, $2, 'Harbor', 'Preserved')", [entity.id, a.id]);
      for (const table of tables) {
        const rows = (await client.query(`SELECT to_jsonb(t) AS data FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
        expect(rows.length).toBeGreaterThan(0);
        snapshots.set(table, rows);
      }
    }
    const source = (await readFile(`drizzle/${migration.tag}.sql`, 'utf8')).replaceAll('"public".', `"${schema}".`);
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await client.query(statement);
  }
  for (const [table, rows] of snapshots) expect((await client.query(`SELECT to_jsonb(t) AS data FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows).toEqual(rows);
  const a = await scope();
  await command(a.user, a.id);
  await entry((await change(a.id, a.user)).id);
});
