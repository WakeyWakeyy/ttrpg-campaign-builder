import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";
import { loadMigrations, runMigrations } from "../../scripts/db-migrations";

const url = process.env.TEST_DATABASE_URL!;
const admin = new Pool({ connectionString: url });
let schema: string;
let pool: Pool;
let client: PoolClient;

beforeEach(async () => {
  schema = "migration_" + randomUUID().replaceAll("-", "");
  await admin.query('CREATE SCHEMA "' + schema + '"');
  pool = new Pool({ connectionString: url, options: "-c search_path=" + schema });
  client = await pool.connect();
});

afterEach(async () => {
  client.release();
  await pool.end();
  await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
});

afterAll(async () => { await admin.end(); });

function options(checkOnly = false) {
  return { checkOnly, appSchema: schema, ledgerSchema: schema };
}

async function applyWithOriginalDrizzle(count?: number) {
  const rows = (await loadMigrations()).slice(0, count);
  const migrations = rows.map(({ sql, hash, when }) => ({
    sql: sql.replaceAll('"public".', '"' + schema + '".').split("--> statement-breakpoint"),
    hash, folderMillis: when, bps: true,
  }));
  // PgDialect declares a narrower generic than the NodePg session its wrapper uses.
  const session = drizzle({ client })._.session as unknown as Parameters<PgDialect["migrate"]>[1];
  await new PgDialect().migrate(migrations, session, { migrationsSchema: schema, migrationsFolder: "drizzle" });
}

async function ledger() {
  const result = await client.query<{ created_at: string; hash: string }>(
    'SELECT created_at, hash FROM "' + schema + '"."__drizzle_migrations" ORDER BY created_at');
  return result.rows;
}

test("applies the complete journal on an empty database and is safe to rerun", async () => {
  const migrations = await loadMigrations();
  await expect(runMigrations(client, options())).resolves.toEqual(migrations.map(item => item.tag));
  const before = await ledger();
  expect(before).toHaveLength(migrations.length);
  await expect(runMigrations(client, options(true))).resolves.toEqual([]);
  await expect(runMigrations(client, options())).resolves.toEqual([]);
  expect(await ledger()).toEqual(before);
});

test("reproduces the old upgrade failure after 0017 and applies the skipped migrations in journal order", async () => {
  const migrations = await loadMigrations();
  const scene = migrations.find(item => item.tag.startsWith("0018_"))!;
  const attendance = migrations.find(item => item.tag.startsWith("0019_"))!;
  expect(scene.when).toBeLessThan(migrations[17].when);
  expect(attendance.when).toBeLessThan(migrations[17].when);
  await applyWithOriginalDrizzle(18);
  const before = await ledger();
  expect(before).toHaveLength(18);
  await expect(applyWithOriginalDrizzle()).rejects.toMatchObject({ cause: { code: "42P01" } });
  expect(await ledger()).toEqual(before);

  await expect(runMigrations(client, options())).resolves.toEqual(migrations.slice(18).map(item => item.tag));
  expect(await ledger()).toEqual(expect.arrayContaining(before));
  expect(await ledger()).toContainEqual({ created_at: String(scene.when), hash: scene.hash });
  expect(await ledger()).toContainEqual({ created_at: String(attendance.when), hash: attendance.hash });
  await expect(runMigrations(client, options(true))).resolves.toEqual([]);
});

test("recovers only the known holes if the old tool already advanced to 0021", async () => {
  const migrations = await loadMigrations();
  await applyWithOriginalDrizzle(18);
  await applyWithOriginalDrizzle(22);
  const before = await ledger();
  expect(before).toHaveLength(20);
  await expect(runMigrations(client, options(true))).rejects.toThrow("0018_previous_wild_pack");
  const result = await runMigrations(client, options());
  expect(result).toEqual(migrations.slice(18).filter((_, i) => i !== 2 && i !== 3).map(item => item.tag));
  expect(await ledger()).toEqual(expect.arrayContaining(before));
});

test("blocks a release if the ledger looks complete but a required constraint is missing", async () => {
  await runMigrations(client, options());
  await client.query('ALTER TABLE "' + schema + '".scene DROP CONSTRAINT scene_session_fk');
  const before = await ledger();
  await expect(runMigrations(client, options(true))).rejects.toThrow("missing or unvalidated scene_session_fk");
  expect(await ledger()).toEqual(before);
});

test("refuses to stamp a migration when pre-existing objects make its DDL fail", async () => {
  await applyWithOriginalDrizzle(18);
  await client.query('CREATE TABLE "' + schema + '".scene (id uuid)');
  const before = await ledger();
  await expect(runMigrations(client, options())).rejects.toThrow("0018_previous_wild_pack failed");
  expect(await ledger()).toEqual(before);
});

test("serializes concurrent migration runners against the same database", async () => {
  const other = await pool.connect();
  try {
    const applied = await Promise.all([runMigrations(client, options()), runMigrations(other, options())]);
    const migrations = await loadMigrations();
    expect(applied.map(item => item.length).sort((a, b) => a - b)).toEqual([0, migrations.length]);
    expect(await ledger()).toHaveLength(migrations.length);
  } finally {
    other.release();
  }
});
