import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, campaignRuleset, encounter, encounterCreature, encounterSrdPlan,
  rulesetVersion, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { addEncounterCreature, archiveEncounter, createEncounter, editEncounter, editEncounterCreature,
  EncounterCreatureNotFoundError, EncounterNotFoundError, EncounterRevisionConflictError,
  getOwnedEncounter, InvalidEncounterInputError, listEncounterCreatures, listOwnedEncounters,
  restoreEncounter, trashEncounter, UnsupportedEncounterVersionError } from "../../src/modules/encounters";
import type { Actor } from "../../src/modules/identity";
import { calculateEncounterBudgetForGroups } from "../../src/modules/rulesets/encounter-budget";
import { getSupportedRulesetVersion } from "../../src/modules/rulesets";

const schema = `encounter_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries)
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
});
beforeEach(async () => {
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id }; other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id; foreignCampaignId = foreign.id;
  const version = await getSupportedRulesetVersion(db);
  const [pin] = await db.select().from(rulesetVersion).where(eq(rulesetVersion.id, version!.id));
  await db.insert(campaignRuleset).values([
    { campaignId, rulesetId: pin.rulesetId, rulesetVersionId: pin.id },
    { campaignId: foreignCampaignId, rulesetId: pin.rulesetId, rulesetVersionId: pin.id },
  ]);
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("creates an owned, version-bound encounter and rejects invalid or foreign creation", async () => {
  await expect(createEncounter(db, actor, { campaignId: foreignCampaignId, title: "Stolen", partyLevel: 1,
    partySize: 4 })).rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createEncounter(db, actor, { campaignId, title: "Bad", partyLevel: 21,
    partySize: 4 })).rejects.toBeInstanceOf(InvalidEncounterInputError);
  const created = await createEncounter(db, actor, { campaignId, title: "Bridge", partyLevel: 3,
    partySize: 5, notes: "Hold the crossing" });
  expect(created).toMatchObject({ entityType: "ENCOUNTER", revision: 1, title: "Bridge",
    partyLevel: 3, partySize: 5 });
  expect(await listOwnedEncounters(db, actor, campaignId)).toHaveLength(1);
  await expect(getOwnedEncounter(db, other, created.id)).rejects.toBeInstanceOf(EncounterNotFoundError);
  await expect(db.insert(encounter).values({ id: randomUUID(), campaignId, title: "Orphan" }))
    .rejects.toMatchObject({ cause: { constraint: "encounter_entity_fk" } });
  await expect(db.update(encounterSrdPlan).set({ campaignId: foreignCampaignId })
    .where(eq(encounterSrdPlan.encounterId, created.id)))
    .rejects.toMatchObject({ cause: { constraint: "encounter_srd_plan_encounter_fk" } });
  await db.delete(campaignRuleset).where(eq(campaignRuleset.campaignId, campaignId));
  await expect(createEncounter(db, actor, { campaignId, title: "No pin", partyLevel: 1, partySize: 4 }))
    .rejects.toBeInstanceOf(UnsupportedEncounterVersionError);
});

test("creature edits are revision-safe and remain in the same campaign", async () => {
  const parent = await createEncounter(db, actor, { campaignId, title: "Bridge", partyLevel: 3, partySize: 5 });
  await expect(addEncounterCreature(db, other, parent.id, { expectedRevision: 1,
    name: "Wight", xp: 700, quantity: 1 })).rejects.toBeInstanceOf(EncounterNotFoundError);
  await expect(addEncounterCreature(db, actor, parent.id, { expectedRevision: 1,
    name: "Invalid", xp: -1, quantity: 1 })).rejects.toBeInstanceOf(InvalidEncounterInputError);
  const first = await addEncounterCreature(db, actor, parent.id, { expectedRevision: 1,
    name: "Wight", xp: 700, quantity: 1 });
  const second = await addEncounterCreature(db, actor, parent.id, { expectedRevision: 2,
    name: "Skeleton", xp: 50, quantity: 8 });
  expect(calculateEncounterBudgetForGroups({ rulesetKey: "dnd-5e-2024", version: "5.2.1",
    partyLevel: parent.partyLevel, partySize: parent.partySize,
    creatures: (await listEncounterCreatures(db, actor, parent.id)).map(row => ({ xp: row.xp,
      quantity: row.quantity })) })).toMatchObject({ totalXp: 1100, budgets: { moderate: 1125 } });
  await expect(db.insert(encounterCreature).values({ campaignId: foreignCampaignId,
    encounterId: parent.id, name: "Wrong", xp: 25, quantity: 1 }))
    .rejects.toMatchObject({ cause: { constraint: "encounter_creature_encounter_fk" } });
  await expect(editEncounterCreature(db, actor, parent.id, first.id, { expectedRevision: 2,
    intent: "trash", name: "", xp: 0, quantity: 1 }))
    .rejects.toBeInstanceOf(EncounterRevisionConflictError);
  await expect(editEncounterCreature(db, actor, parent.id, randomUUID(), { expectedRevision: 3,
    intent: "trash", name: "", xp: 0, quantity: 1 }))
    .rejects.toBeInstanceOf(EncounterCreatureNotFoundError);
  await editEncounterCreature(db, actor, parent.id, first.id, { expectedRevision: 3,
    intent: "trash", name: "", xp: 0, quantity: 1 });
  await editEncounterCreature(db, actor, parent.id, first.id, { expectedRevision: 4,
    intent: "restore", name: "", xp: 0, quantity: 1 });
  expect((await listEncounterCreatures(db, actor, parent.id)).find(row => row.id === first.id))
    .toMatchObject({ name: "Wight", xp: 700, deletedAt: null });
  expect(second.id === first.id).toBe(false);
});

test("concurrent writes conflict; archive, trash and restore preserve the plan", async () => {
  const parent = await createEncounter(db, actor, { campaignId, title: "Gate", partyLevel: 1, partySize: 4 });
  const attempts = await Promise.allSettled([
    addEncounterCreature(db, actor, parent.id, { expectedRevision: 1, name: "Rat", xp: 25, quantity: 2 }),
    editEncounter(db, actor, parent.id, { expectedRevision: 1, title: "Changed", partyLevel: 1, partySize: 4 }),
  ]);
  expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find(result => result.status === "rejected"))
    .toMatchObject({ reason: expect.any(EncounterRevisionConflictError) });
  const current = await getOwnedEncounter(db, actor, parent.id);
  const archived = await archiveEncounter(db, actor, parent.id, current.revision);
  const trashed = await trashEncounter(db, actor, parent.id, archived.revision);
  await expect(addEncounterCreature(db, actor, parent.id, { expectedRevision: trashed.revision,
    name: "Rat", xp: 25, quantity: 1 })).rejects.toBeInstanceOf(InvalidEncounterInputError);
  const restored = await restoreEncounter(db, actor, parent.id, trashed.revision);
  expect(restored).toMatchObject({ archivedAt: archived.archivedAt, deletedAt: null,
    partyLevel: 1, partySize: 4 });
  expect(await db.select().from(campaignEntity)).toHaveLength(1);
});
