import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { campaign, campaignCompass, campaignEntity, campaignRuleset, location, rewardGrant, ruleset, rulesetVersion, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { archiveEncounter, createEncounter, placeEncounter } from "../../src/modules/encounters";
import { buildCampaignExport } from "../../src/modules/export";
import { buildSessionSheet } from "../../src/modules/export/session-sheet";
import { createPlayerCharacter } from "../../src/modules/player-characters";
import { createScene, createSession, editScene, getOwnedSession, setSessionAttendance, SessionNotFoundError } from "../../src/modules/sessions";

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
  const [family] = await db.select().from(ruleset).where(eq(ruleset.key, "dnd-5e-2024"));
  const [version] = await db.select().from(rulesetVersion).where(and(eq(rulesetVersion.rulesetId, family.id),
    eq(rulesetVersion.version, "5.2.1")));
  await db.insert(campaignRuleset).values([first, second].map(row => ({ campaignId: row.id,
    rulesetId: family.id, rulesetVersionId: version.id })));
  await db.insert(campaignCompass).values([
    { campaignId: first.id, originalPremise: "My premise", currentPremise: "My premise" },
    { campaignId: second.id, originalPremise: "Other premise", currentPremise: "Other premise" },
  ]);
  const [entity] = await db.insert(campaignEntity).values({ campaignId: first.id, entityType: "LOCATION", createdByUserId: owner.id,
    archivedAt: new Date("2026-01-01T00:00:00Z") }).returning();
  await db.insert(location).values({ id: entity.id, campaignId: first.id, name: "Old tower" });
  const [grant] = await db.insert(rewardGrant).values({ campaignId: first.id, requestKey: randomUUID(),
    requestHash: "retry-only", rewardTitle: "Old favor", recipient: "The party" }).returning();

  const exported = await buildCampaignExport(db, { userId: owner.id }, first.id);
  expect(exported.formatVersion).toBe(1);
  expect(exported.ruleset).toMatchObject({ key: "dnd-5e-2024", version: "5.2.1" });
  expect(exported.campaign).toMatchObject({ id: first.id, name: "Mine" });
  expect("ownerUserId" in exported.campaign).toBe(false);
  expect("created_by_user_id" in exported.records.campaign_entity[0]).toBe(false);
  expect(exported.records.reward_grant).toMatchObject([{ id: grant.id, reward_title: "Old favor" }]);
  expect("request_key" in exported.records.reward_grant[0]).toBe(false);
  expect("request_hash" in exported.records.reward_grant[0]).toBe(false);
  expect(exported.records.campaign_compass).toMatchObject([{ current_premise: "My premise" }]);
  expect(exported.records.location).toMatchObject([{ id: entity.id, name: "Old tower" }]);
  expect(exported.records.campaign_entity[0].id).toBe(entity.id);
  expect(new Date(String(exported.records.campaign_entity[0].archived_at)).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  expect(JSON.stringify(exported).includes("Other premise")).toBe(false);
  await expect(buildCampaignExport(db, { userId: stranger.id }, first.id)).rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(buildCampaignExport(db, { userId: owner.id }, second.id)).rejects.toBeInstanceOf(CampaignNotFoundError);
});

test("session sheet is owner scoped and omits unavailable scenes and encounters", async () => {
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  const [owned] = await db.insert(campaign).values({ ownerUserId: owner.id, name: "My campaign" }).returning();
  const [family] = await db.select().from(ruleset).where(eq(ruleset.key, "dnd-5e-2024"));
  const [version] = await db.select().from(rulesetVersion).where(and(eq(rulesetVersion.rulesetId, family.id),
    eq(rulesetVersion.version, "5.2.1")));
  await db.insert(campaignRuleset).values({ campaignId: owned.id, rulesetId: family.id, rulesetVersionId: version.id });
  const actor = { userId: owner.id };
  const previous = await createSession(db, actor, { campaignId: owned.id, title: "Arrival", outcome: "The party entered." });
  const current = await createSession(db, actor, { campaignId: owned.id, title: "The gate", preparation: "Meet the watch." });
  const kept = await createScene(db, actor, current.id, { expectedRevision: 1, title: "Watch", preparation: "Ask for entry." });
  const removed = await createScene(db, actor, current.id, { expectedRevision: 2, title: "Removed scene", preparation: "Old plan" });
  await editScene(db, actor, current.id, removed.id, { expectedRevision: 3, intent: "trash", title: "" });
  const visible = await createEncounter(db, actor, { campaignId: owned.id, title: "Gate watch", partyLevel: 1, partySize: 4 });
  const hidden = await createEncounter(db, actor, { campaignId: owned.id, title: "Archived fight", partyLevel: 1, partySize: 4 });
  await placeEncounter(db, actor, current.id, { expectedRevision: 4, encounterId: visible.id, sceneId: kept.id });
  await placeEncounter(db, actor, current.id, { expectedRevision: 5, encounterId: hidden.id });
  await archiveEncounter(db, actor, hidden.id, 1);
  const pc = await createPlayerCharacter(db, actor, { campaignId: owned.id, name: "Mira" });
  await setSessionAttendance(db, actor, current.id, { expectedRevision: 6, playerCharacterIds: [pc.id] });

  const sheet = await buildSessionSheet(db, actor, current.id);
  expect(sheet).toMatchObject({ campaignName: "My campaign", title: "The gate", preparation: "Meet the watch.",
    attendance: ["Mira"], previous: { title: previous.title, outcome: "The party entered." },
    scenes: [{ id: kept.id, title: "Watch" }], encounters: [{ title: "Gate watch", sceneId: kept.id }] });
  expect(sheet.scenes).toHaveLength(1);
  expect(sheet.encounters).toHaveLength(1);
  expect((await getOwnedSession(db, actor, current.id)).revision).toBe(7);
  await expect(buildSessionSheet(db, { userId: stranger.id }, current.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(buildSessionSheet(db, actor, randomUUID())).rejects.toBeInstanceOf(SessionNotFoundError);
});
