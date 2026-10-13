import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { campaign, campaignIntelligencePreferences, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { getIntelligencePreferences, IntelligencePreferencesConflictError, setIntelligencePreferences } from "../../src/modules/intelligence/preferences";

const schema = `intelligence_${randomUUID().replaceAll("-", "")}`;
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

test("campaign owners can configure prompts without losing records or overwriting concurrent changes", async () => {
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  const [savedCampaign] = await db.insert(campaign).values({ ownerUserId: owner.id, name: "Test" }).returning();
  const ownerActor = { userId: owner.id };
  const strangerActor = { userId: stranger.id };
  const defaults = await getIntelligencePreferences(db, ownerActor, savedCampaign.id);
  expect(defaults).toMatchObject({ revision: 0, questContinuity: true, timelineDates: true,
    clueRoutes: true, secretDiscovery: true });
  await expect(setIntelligencePreferences(db, strangerActor, savedCampaign.id, defaults)).rejects.toBeInstanceOf(CampaignNotFoundError);
  const configured = await setIntelligencePreferences(db, ownerActor, savedCampaign.id,
    { ...defaults, secretDiscovery: false, clueRoutes: false });
  expect(configured).toMatchObject({ revision: 1, secretDiscovery: false, clueRoutes: false });
  await expect(setIntelligencePreferences(db, ownerActor, savedCampaign.id, defaults)).rejects.toBeInstanceOf(IntelligencePreferencesConflictError);
  const next = await setIntelligencePreferences(db, ownerActor, savedCampaign.id, { ...configured, questContinuity: false });
  expect(next.revision).toBe(2);
  await expect(setIntelligencePreferences(db, ownerActor, savedCampaign.id, configured)).rejects.toBeInstanceOf(IntelligencePreferencesConflictError);
  expect(await getIntelligencePreferences(db, ownerActor, savedCampaign.id)).toMatchObject({ questContinuity: false, secretDiscovery: false });
  expect(await db.select().from(campaignIntelligencePreferences)).toHaveLength(1);
  await expect(getIntelligencePreferences(db, strangerActor, savedCampaign.id)).rejects.toBeInstanceOf(CampaignNotFoundError);
});
