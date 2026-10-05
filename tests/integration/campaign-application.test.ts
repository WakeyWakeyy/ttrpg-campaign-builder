import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignCompass, campaignRuleset, ruleset, rulesetVersion, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError, createCampaign, getOwnedCampaign, InvalidCampaignInputError, listOwnedCampaigns, RulesetVersionNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";

// Commands commit their own transactions. Isolate fixtures and failure constraints
// from other suites and any existing contents of the dedicated test database.
const schema = `a7_campaign_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema},public`,
});
const db = drizzle({ client: pool });
let actor: Actor;
let otherActor: Actor;
let selectedVersion: typeof rulesetVersion.$inferSelect;
let otherRulesetId: string;
const creative = { name: "Same name", originalPremise: "  A lost city awakens.\n" };
const input = () => ({ ...creative, rulesetVersionId: selectedVersion.id });

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) {
    const migration = await readFile(`drizzle/${tag}.sql`, "utf8");
    await pool.query(migration.replaceAll('"public".', `"${schema}".`));
  }
  const [family, otherFamily] = await db.insert(ruleset).values([
    { key: "a7-selected", name: "Selected" },
    { key: "a7-other", name: "Other" },
  ]).returning();
  otherRulesetId = otherFamily.id;
  [selectedVersion] = await db.insert(rulesetVersion).values({
    rulesetId: family.id, version: "1", name: "Selected version",
  }).returning();
});
beforeEach(async () => {
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, otherOwner] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id };
  otherActor = { userId: otherOwner.id };
});
afterAll(async () => {
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await pool.end(); }
});

async function expectNoCampaignWrites() {
  expect(await db.select().from(campaign)).toEqual([]);
  expect(await db.select().from(campaignRuleset)).toEqual([]);
  expect(await db.select().from(campaignCompass)).toEqual([]);
}

test("creation persists the Actor owner, derived Ruleset pin and original creative content together", async () => {
  // Extra runtime fields cannot override authoritative values (e.g. submitted JSON).
  const submitted = {
    ...input(), ownerUserId: otherActor.userId, rulesetId: otherRulesetId,
    description: "Description", setting: "Coast", tone: "Hopeful", originalNotes: "GM notes",
    currentPremise: "Untrusted override",
  };
  const created = await createCampaign(db, actor, submitted);
  expect(created).toMatchObject({
    name: creative.name, ownerUserId: actor.userId, description: submitted.description,
  });
  expect(await db.select().from(campaign)).toEqual([created]);
  expect(await db.select().from(campaignRuleset)).toEqual([expect.objectContaining({
    campaignId: created.id, rulesetId: selectedVersion.rulesetId, rulesetVersionId: selectedVersion.id,
  })]);
  expect(await db.select().from(campaignCompass)).toEqual([expect.objectContaining({
    campaignId: created.id, originalPremise: creative.originalPremise,
    currentPremise: creative.originalPremise, setting: submitted.setting,
    tone: submitted.tone, originalNotes: submitted.originalNotes, revision: 1,
  })]);
});

test("optional creative fields may be omitted and duplicate Campaign names remain allowed", async () => {
  const first = await createCampaign(db, actor, input());
  const second = await createCampaign(db, actor, input());
  expect(second.id).not.toBe(first.id);
  expect(first.name).toBe(second.name);
  expect(first.description).toBeNull();
  const compasses = await db.select().from(campaignCompass);
  expect(compasses).toHaveLength(2);
  expect(compasses).toEqual(expect.arrayContaining([
    expect.objectContaining({ campaignId: first.id, setting: null, tone: null, originalNotes: null }),
    expect.objectContaining({ campaignId: second.id, setting: null, tone: null, originalNotes: null }),
  ]));
});

test.each([randomUUID(), "invalid", ""])("missing/invalid Ruleset Version %s leaves no writes", async id => {
  const result = createCampaign(db, actor, { ...input(), rulesetVersionId: id });
  await expect(result).rejects.toBeInstanceOf(RulesetVersionNotFoundError);
  await expect(result).rejects.toMatchObject({ code: "RULESET_VERSION_NOT_FOUND" });
  await expectNoCampaignWrites();
});

test.each([
  ["name", ""], ["name", " \t\n"],
  ["originalPremise", ""], ["originalPremise", " \t\n"],
])("rejects blank %s (%j) without writes", async (field, value) => {
  const result = createCampaign(db, actor, { ...input(), [field]: value });
  await expect(result).rejects.toBeInstanceOf(InvalidCampaignInputError);
  await expect(result).rejects.toMatchObject({ code: "INVALID_CAMPAIGN_INPUT", field });
  await expectNoCampaignWrites();
});

test("listOwnedCampaigns scopes every result to the Actor", async () => {
  await createCampaign(db, otherActor, input());
  expect(await listOwnedCampaigns(db, actor)).toEqual([]);
  const first = await createCampaign(db, actor, input());
  const second = await createCampaign(db, actor, input());
  const owned = await listOwnedCampaigns(db, actor);
  expect(owned).toHaveLength(2);
  expect(owned).toEqual(expect.arrayContaining([first, second]));
});

test("getOwnedCampaign returns an owned Campaign", async () => {
  const created = await createCampaign(db, actor, input());
  await expect(getOwnedCampaign(db, actor, created.id)).resolves.toEqual(created);
});

test("non-owned, missing and malformed Campaign IDs have identical typed failure behavior", async () => {
  const other = await createCampaign(db, otherActor, input());
  for (const id of [other.id, randomUUID(), "invalid"]) {
    const result = getOwnedCampaign(db, actor, id);
    await expect(result).rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(result).rejects.toMatchObject({
      name: "CampaignNotFoundError", code: "CAMPAIGN_NOT_FOUND", message: "Campaign not found.",
    });
  }
});

test.each(["campaign_ruleset", "campaign_compass"])("failure inserting %s rolls back the complete command", async table => {
  // Real PostgreSQL failure after the Campaign insert, with no production hooks.
  await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT a7_reject_insert CHECK (false)`);
  try {
    await expect(createCampaign(db, actor, input())).rejects.toMatchObject({
      cause: { code: "23514", constraint: "a7_reject_insert" },
    });
    await expectNoCampaignWrites();
  } finally {
    await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT a7_reject_insert`);
  }
});
