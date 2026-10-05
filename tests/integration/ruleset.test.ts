import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../../src/infrastructure/db";
import { ruleset, rulesetVersion, rulesetContentSource } from "../../src/infrastructure/db/schema";
import { getSupportedRulesetVersion } from "../../src/modules/rulesets";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error("Set TEST_DATABASE_URL to a dedicated test PostgreSQL database.");
}
const { pool } = createDatabase(connectionString);
let client: PoolClient | undefined;
let db: NodePgDatabase;

beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  db = drizzle({ client });
});

afterEach(async () => {
  if (client) {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
      client = undefined;
    }
  }
});

afterAll(async () => { await pool.end(); });

test("supported Ruleset lookup returns the persisted seeded version ID", async () => {
  const version = await getSupportedRulesetVersion(db);
  const [expected] = await db.select({ id: rulesetVersion.id }).from(rulesetVersion)
    .innerJoin(ruleset, eq(ruleset.id, rulesetVersion.rulesetId))
    .where(eq(ruleset.key, "dnd-5e-2024"));
  expect(version).toEqual(expected);
});

test("supported Ruleset lookup does not fall back to another version", async () => {
  const version = await getSupportedRulesetVersion(db);
  expect(version).not.toBeNull();
  // The transaction rolls back this test-only change to published metadata.
  await db.update(rulesetVersion).set({ version: "unsupported-test-version" })
    .where(eq(rulesetVersion.id, version!.id));
  expect(await getSupportedRulesetVersion(db)).toBeNull();
});

async function newRuleset() {
  const [row] = await db.insert(ruleset).values({
    key: sql`'integration-' || uuidv7()::text`, name: "Test Ruleset",
  }).returning();
  return row;
}

async function newVersion(rulesetId: string, version = "test-1") {
  const [row] = await db.insert(rulesetVersion).values({
    rulesetId, version, name: "Test Version",
  }).returning();
  return row;
}

function sourceValues(rulesetVersionId: string, key = "test-source") {
  return {
    rulesetVersionId, key, title: "Test Source", sourceUrl: "https://example.com/source",
    license: "test-license", licenseUrl: "https://example.com/license", attribution: "Test attribution",
  };
}

test("migration seeds the official Ruleset, Version and source with exact provenance", async () => {
  const rows = await db.select().from(ruleset)
    .innerJoin(rulesetVersion, eq(rulesetVersion.rulesetId, ruleset.id))
    .innerJoin(rulesetContentSource, eq(rulesetContentSource.rulesetVersionId, rulesetVersion.id))
    .where(eq(ruleset.key, "dnd-5e-2024"));
  const target = rows.filter((row) => row.ruleset_version.version === "5.2.1"
    && row.ruleset_content_source.key === "srd-5.2.1-en");
  expect(target).toHaveLength(1);
  const row = target[0];
  expect(row.ruleset.name).toBe("D&D Fifth Edition (2024)");
  expect(row.ruleset_version).toMatchObject({
    rulesetId: row.ruleset.id, name: "SRD 5.2.1", publishedAt: "2025-05-01",
  });
  expect(row.ruleset_content_source).toMatchObject({
    rulesetVersionId: row.ruleset_version.id,
    title: "System Reference Document 5.2.1",
    sourceUrl: "https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/legalcode",
    publishedAt: "2025-05-01",
    attribution: "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
  });
});

test("all Ruleset tables generate UUIDv7 IDs and timezone-aware timestamps", async () => {
  const family = await newRuleset();
  const version = await newVersion(family.id);
  const [source] = await db.insert(rulesetContentSource).values(sourceValues(version.id)).returning();
  for (const row of [family, version, source]) {
    expect((await db.execute(sql`SELECT uuid_extract_version(${row.id}::uuid) AS version`)).rows)
      .toEqual([{ version: 7 }]);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  }
  expect(version.publishedAt).toBeNull();
  expect(source.publishedAt).toBeNull();
});

test("Ruleset keys are unique", async () => {
  const family = await newRuleset();
  await expect(db.insert(ruleset).values({ key: family.key, name: "Duplicate" }))
    .rejects.toMatchObject({ cause: { code: "23505", constraint: "ruleset_key_unique" } });
});

test("Version identifiers are unique within a Ruleset", async () => {
  const family = await newRuleset();
  await newVersion(family.id);
  await expect(newVersion(family.id)).rejects.toMatchObject({
    cause: { code: "23505", constraint: "ruleset_version_ruleset_version_unique" },
  });
});

test("different Rulesets may use the same Version identifier", async () => {
  const first = await newVersion((await newRuleset()).id);
  const second = await newVersion((await newRuleset()).id);
  expect(first.version).toBe(second.version);
  expect(first.rulesetId).not.toBe(second.rulesetId);
});

test("source keys are unique within a Version", async () => {
  const version = await newVersion((await newRuleset()).id);
  await db.insert(rulesetContentSource).values(sourceValues(version.id));
  await expect(db.insert(rulesetContentSource).values(sourceValues(version.id)))
    .rejects.toMatchObject({ cause: { code: "23505", constraint: "ruleset_content_source_version_key_unique" } });
});

test("Versions support multiple sources and source keys can recur in other Versions", async () => {
  const family = await newRuleset();
  const first = await newVersion(family.id);
  const second = await newVersion(family.id, "test-2");
  const sources = await db.insert(rulesetContentSource).values([
    sourceValues(first.id), sourceValues(first.id, "another-source"), sourceValues(second.id),
  ]).returning();
  expect(sources).toHaveLength(3);
});

test("a Version cannot reference a missing Ruleset", async () => {
  const family = await newRuleset();
  await db.delete(ruleset).where(eq(ruleset.id, family.id));
  await expect(newVersion(family.id)).rejects.toMatchObject({
    cause: { code: "23503", constraint: "ruleset_version_ruleset_id_ruleset_id_fk" },
  });
});

test("a source cannot reference a missing Version", async () => {
  const version = await newVersion((await newRuleset()).id);
  await db.delete(rulesetVersion).where(eq(rulesetVersion.id, version.id));
  await expect(db.insert(rulesetContentSource).values(sourceValues(version.id)))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "ruleset_content_source_ruleset_version_id_ruleset_version_id_fk" } });
});

test("referenced Rulesets cannot be deleted", async () => {
  const family = await newRuleset();
  await newVersion(family.id);
  await expect(db.delete(ruleset).where(eq(ruleset.id, family.id)))
    .rejects.toMatchObject({ cause: { code: "23001", constraint: "ruleset_version_ruleset_id_ruleset_id_fk" } });
});

test("Versions with sources cannot be deleted", async () => {
  const version = await newVersion((await newRuleset()).id);
  await db.insert(rulesetContentSource).values(sourceValues(version.id));
  await expect(db.delete(rulesetVersion).where(eq(rulesetVersion.id, version.id)))
    .rejects.toMatchObject({ cause: { code: "23001", constraint: "ruleset_content_source_ruleset_version_id_ruleset_version_id_fk" } });
});

test("the composite Version key supports foreign keys and rejects mismatched pairs", async () => {
  const family = await newRuleset();
  const probe = sql.identifier(`version_pin_probe_${family.id.replaceAll("-", "")}`);
  // PostgreSQL disallows temporary-to-permanent FKs. ROLLBACK removes this
  // uniquely named regular table, including when the expected violation aborts.
  await db.execute(sql`CREATE TABLE ${probe} (
    ruleset_id uuid NOT NULL,
    version_id uuid NOT NULL,
    FOREIGN KEY (ruleset_id, version_id) REFERENCES ruleset_version (ruleset_id, id)
  )`);
  const version = await newVersion(family.id);
  const other = await newRuleset();
  await db.execute(sql`INSERT INTO ${probe} VALUES (${family.id}, ${version.id})`);
  await expect(db.execute(sql`INSERT INTO ${probe} VALUES (${other.id}, ${version.id})`))
    .rejects.toMatchObject({ cause: { code: "23503" } });
});
