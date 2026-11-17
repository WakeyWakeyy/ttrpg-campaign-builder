import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";

const migrationsFolder = new URL("../drizzle/", import.meta.url);
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const recoveryTags = new Set(["0018_previous_wild_pack", "0019_moaning_luckman"]);
const requiredConstraints = ["scene_session_fk", "session_attendance_session_fk",
  "session_attendance_player_character_fk", "encounter_placement_scene_fk"];

function identifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Invalid migration schema.");
  return '"' + value + '"';
}

export async function loadMigrations() {
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationsFolder), "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  return Promise.all(journal.entries.map(async entry => {
    const sql = await readFile(new URL(entry.tag + ".sql", migrationsFolder), "utf8");
    const lf = sql.replaceAll("\r\n", "\n");
    return { ...entry, sql, hash: digest(sql), equivalentHashes: [digest(lf), digest(lf.replaceAll("\n", "\r\n"))] };
  }));
}

type Options = { checkOnly?: boolean; appSchema?: string; ledgerSchema?: string };
export async function runMigrations(client: PoolClient, {
  checkOnly = false, appSchema = "public", ledgerSchema = "drizzle",
}: Options = {}) {
  const app = identifier(appSchema);
  const ledger = identifier(ledgerSchema) + '."__drizzle_migrations"';
  const migrations = await loadMigrations();
  const lastTag = migrations.at(-1)!.tag;
  const snapshot = JSON.parse(await readFile(new URL("meta/" + lastTag.slice(0, 4) + "_snapshot.json", migrationsFolder), "utf8")) as {
    tables: Record<string, { name: string; columns: Record<string, unknown> }>;
  };
  const expected = new Map(migrations.map((migration, index) => [migration.when, { migration, index }]));
  if (expected.size !== migrations.length) throw new Error("Migration journal contains duplicate timestamps.");

  await client.query(checkOnly ? "BEGIN READ ONLY" : "BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SELECT pg_advisory_xact_lock(92321948, 1841)");
    await client.query("SET LOCAL search_path = " + app);
    if (!checkOnly) {
      await client.query("CREATE SCHEMA IF NOT EXISTS " + identifier(ledgerSchema));
      await client.query("CREATE TABLE IF NOT EXISTS " + ledger +
        " (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)");
    }
    const history = await client.query<{ created_at: string; hash: string }>("SELECT created_at, hash FROM " + ledger);
    const applied = new Set<number>();
    let latestIndex = -1;
    for (const row of history.rows) {
      const timestamp = Number(row.created_at);
      const entry = expected.get(timestamp);
      if (!entry || applied.has(timestamp)) throw new Error("Migration ledger has an unknown or duplicate entry.");
      if (!entry.migration.equivalentHashes.includes(row.hash)) {
        throw new Error("Migration ledger hash differs for " + entry.migration.tag + ".");
      }
      applied.add(timestamp);
      latestIndex = Math.max(latestIndex, entry.index);
    }
    const missing = migrations.filter(migration => !applied.has(migration.when));
    if (checkOnly && missing.length) throw new Error("Unapplied migrations: " + missing.map(item => item.tag).join(", "));
    for (const migration of missing) {
      if (expected.get(migration.when)!.index < latestIndex && !recoveryTags.has(migration.tag)) {
        throw new Error("Unexpected migration gap: " + migration.tag + ".");
      }
      try {
        for (const statement of migration.sql.split("--> statement-breakpoint").filter(sql => sql.trim())) {
          await client.query(statement.replaceAll('"public".', app + "."));
        }
        await client.query("INSERT INTO " + ledger + " (hash, created_at) VALUES ($1, $2)", [migration.hash, migration.when]);
      } catch {
        throw new Error("Migration " + migration.tag + " failed. The transaction was rolled back.");
      }
    }

    const columns = await client.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns JOIN information_schema.tables USING (table_catalog, table_schema, table_name) WHERE table_schema = $1 AND table_type = 'BASE TABLE'", [appSchema]);
    const available = new Set(columns.rows.map(row => row.table_name + "." + row.column_name));
    const missingColumn = Object.values(snapshot.tables)
      .flatMap(table => Object.keys(table.columns).map(column => table.name + "." + column))
      .find(column => !available.has(column));
    if (missingColumn) throw new Error("Schema check failed: missing or inaccessible " + missingColumn + ".");
    const constraints = await client.query<{ conname: string }>(
      "SELECT conname FROM pg_constraint WHERE connamespace = $1::regnamespace AND convalidated", [appSchema]);
    const found = new Set(constraints.rows.map(row => row.conname));
    const missingConstraint = requiredConstraints.find(name => !found.has(name));
    if (missingConstraint) throw new Error("Schema check failed: missing or unvalidated " + missingConstraint + ".");
    await client.query("COMMIT");
    return missing.map(migration => migration.tag);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  config({ quiet: true });
  const checkOnly = process.argv[2] === "check";
  const connectionString = checkOnly ? process.env.DATABASE_URL : process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error("Configure the PostgreSQL connection before running the migration command.");
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    const client = await pool.connect();
    try {
      const applied = await runMigrations(client, { checkOnly });
      console.log(checkOnly ? "PostgreSQL schema is ready." : "Applied " + applied.length + " migrations. PostgreSQL schema is ready.");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Postgres errors can include connection information or SQL details.
    const message = error instanceof Error && /^(Migration |Schema check failed:|Unexpected migration gap:|Unapplied migrations:|Configure the PostgreSQL)/.test(error.message)
      ? error.message : "PostgreSQL migration check failed. Verify connectivity, PostgreSQL version, and database permissions.";
    console.error(message);
    process.exitCode = 1;
  });
}
