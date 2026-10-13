import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { campaign, campaignCompass, campaignEntity, location, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { buildCampaignExport } from "../../src/modules/export";

const schema = `export_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const migration = await readFile(`drizzle/${tag}.sql`, "utf8");
    await pool.query(migration.replaceAll('"public".', `"${schema}".`));
  }
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("exports only the owner's campaign and preserves recoverable records", async () => {
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  const [first, second] = await db.insert(campaign).values([
    { ownerUserId: owner.id, name: "Mine" },
    { ownerUserId: stranger.id, name: "Theirs" },
  ]).returning();
  await db.insert(campaignCompass).values([
    { campaignId: first.id, originalPremise: "My premise", currentPremise: "My premise" },
    { campaignId: second.id, originalPremise: "Other premise", currentPremise: "Other premise" },
  ]);
  const [entity] = await db.insert(campaignEntity).values({ campaignId: first.id, entityType: "LOCATION", createdByUserId: owner.id,
    archivedAt: new Date("2026-01-01T00:00:00Z") }).returning();
  await db.insert(location).values({ id: entity.id, campaignId: first.id, name: "Old tower" });

  const exported = await buildCampaignExport(db, { userId: owner.id }, first.id);
  expect(exported.formatVersion).toBe(1);
  expect(exported.campaign).toMatchObject({ id: first.id, name: "Mine" });
  expect(exported.campaign).not.toHaveProperty("ownerUserId");
  expect(exported.records.campaign_compass).toMatchObject([{ current_premise: "My premise" }]);
  expect(exported.records.location).toMatchObject([{ id: entity.id, name: "Old tower" }]);
  expect(exported.records.campaign_entity).toMatchObject([{ id: entity.id, archived_at: new Date("2026-01-01T00:00:00Z") }]);
  expect(JSON.stringify(exported)).not.toContain("Other premise");
  await expect(buildCampaignExport(db, { userId: stranger.id }, first.id)).rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(buildCampaignExport(db, { userId: owner.id }, second.id)).rejects.toBeInstanceOf(CampaignNotFoundError);
});
