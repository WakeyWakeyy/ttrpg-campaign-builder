import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, campaignRuleset, commandExecution, encounter, encounterCreature, encounterPlacement, encounterSrdPlan,
  rulesetVersion, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { addEncounterCreature, archiveEncounter, createEncounter, editEncounter, editEncounterCreature,
  EncounterCreatureNotFoundError, EncounterNotFoundError, EncounterPlacementNotFoundError, EncounterRevisionConflictError,
  getOwnedEncounter, InvalidEncounterInputError, listEncounterCreatures, listOwnedEncounters,
  listSessionEncounterPlacements, placeEncounter, removeEncounterPlacement,
  restoreEncounter, trashEncounter, UnsupportedEncounterVersionError,
  InvalidEncounterRunInputError, listSessionEncounterRuns, recordEncounterRun } from "../../src/modules/encounters";
import type { Actor } from "../../src/modules/identity";
import { calculateEncounterBudgetForGroups } from "../../src/modules/rulesets/encounter-budget";
import { getSupportedRulesetVersion } from "../../src/modules/rulesets";
import { relationshipOptions } from "../../src/app/relationship-options";
import { createTimelineEvent, listTimelineEventLinks } from "../../src/modules/timeline";
import { createScene, createSession, getOwnedSession,
  InvalidSessionInputError, listSessionScenes, reuseSessionPreparation, SessionNotFoundError,
  SessionRevisionConflictError, trashSession } from "../../src/modules/sessions";

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
  await db.delete(commandExecution);
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

test("offers encounters for links and snapshots their title in the timeline", async () => {
  const owned = await createEncounter(db, actor, { campaignId, title: "Bridge", partyLevel: 3, partySize: 5 });
  const foreign = await createEncounter(db, other, { campaignId: foreignCampaignId,
    title: "Other bridge", partyLevel: 3, partySize: 5 });
  const choices = await relationshipOptions(db, actor, campaignId);
  expect(choices).toContainEqual({ id: owned.id, name: "Bridge", type: "Encounter", deletedAt: null });
  expect(choices.some(choice => choice.id === foreign.id)).toBe(false);
  const event = await createTimelineEvent(db, actor, { campaignId, title: "Crossing", entityIds: [owned.id] });
  expect(await listTimelineEventLinks(db, actor, event.id)).toMatchObject([
    { targetEntityId: owned.id, targetTypeSnapshot: "ENCOUNTER", targetNameSnapshot: "Bridge" },
  ]);
});

test("places reusable encounters in a session or scene and copies available placements", async () => {
  const definition = await createEncounter(db, actor, { campaignId, title: "Bridge", partyLevel: 3, partySize: 5 });
  const foreignDefinition = await createEncounter(db, other, { campaignId: foreignCampaignId,
    title: "Other", partyLevel: 3, partySize: 5 });
  const source = await createSession(db, actor, { campaignId, title: "Crossing" });
  const kept = await createScene(db, actor, source.id, { expectedRevision: 1, title: "Gate" });
  await expect(placeEncounter(db, other, source.id, { expectedRevision: 2, encounterId: definition.id }))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(placeEncounter(db, actor, source.id, { expectedRevision: 2, encounterId: foreignDefinition.id }))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
  await expect(placeEncounter(db, actor, source.id, { expectedRevision: 2, encounterId: definition.id,
    sceneId: randomUUID() })).rejects.toBeInstanceOf(InvalidSessionInputError);
  const first = await placeEncounter(db, actor, source.id, { expectedRevision: 2, encounterId: definition.id });
  await expect(db.insert(encounterPlacement).values({ campaignId, sessionId: source.id,
    encounterId: foreignDefinition.id })).rejects.toMatchObject({ cause: { constraint: "encounter_placement_encounter_fk" } });
  const foreignSession = await createSession(db, other, { campaignId: foreignCampaignId, title: "Other session" });
  const foreignScene = await createScene(db, other, foreignSession.id, { expectedRevision: 1, title: "Other scene" });
  await expect(db.insert(encounterPlacement).values({ campaignId, sessionId: source.id,
    encounterId: definition.id, sceneId: foreignScene.id }))
    .rejects.toMatchObject({ cause: { constraint: "encounter_placement_scene_fk" } });
  await placeEncounter(db, actor, source.id, { expectedRevision: 3, encounterId: definition.id, sceneId: kept.id });
  await expect(placeEncounter(db, actor, source.id, { expectedRevision: 3, encounterId: definition.id }))
    .rejects.toBeInstanceOf(SessionRevisionConflictError);
  expect(await listSessionEncounterPlacements(db, actor, source.id)).toHaveLength(2);
  const copy = await reuseSessionPreparation(db, actor, source.id, 4, randomUUID());
  const copied = await listSessionEncounterPlacements(db, actor, copy.id);
  expect(copied).toHaveLength(2);
  expect(copied.map(row => row.encounterId)).toEqual([definition.id, definition.id]);
  expect(copied.find(row => row.sceneId)?.sceneId).toBe((await listSessionScenes(db, actor, copy.id))[0].id);
  await expect(removeEncounterPlacement(db, other, source.id, first.id, 4))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(removeEncounterPlacement(db, actor, source.id, randomUUID(), 4))
    .rejects.toBeInstanceOf(EncounterPlacementNotFoundError);
  await removeEncounterPlacement(db, actor, source.id, first.id, 4);
  expect((await getOwnedSession(db, actor, source.id)).revision).toBe(5);
  expect(await listSessionEncounterPlacements(db, actor, source.id)).toHaveLength(1);
  expect((await getOwnedEncounter(db, actor, definition.id)).title).toBe("Bridge");
  await trashSession(db, actor, source.id, 5);
  await expect(placeEncounter(db, actor, source.id, { expectedRevision: 6, encounterId: definition.id }))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
});

test("keeps each placement with its scene when copying several scenes", async () => {
  const first = await createEncounter(db, actor, { campaignId, title: "First", partyLevel: 2, partySize: 4 });
  const second = await createEncounter(db, actor, { campaignId, title: "Second", partyLevel: 2, partySize: 4 });
  const source = await createSession(db, actor, { campaignId, title: "Two scenes" });
  const opening = await createScene(db, actor, source.id, { expectedRevision: 1, title: "Opening" });
  const ending = await createScene(db, actor, source.id, { expectedRevision: 2, title: "Ending" });
  await placeEncounter(db, actor, source.id, { expectedRevision: 3, sceneId: opening.id, encounterId: first.id });
  await placeEncounter(db, actor, source.id, { expectedRevision: 4, sceneId: ending.id, encounterId: second.id });
  const copy = await reuseSessionPreparation(db, actor, source.id, 5, randomUUID());
  const scenes = await listSessionScenes(db, actor, copy.id);
  const placements = await listSessionEncounterPlacements(db, actor, copy.id);
  expect(placements.find(row => row.encounterId === first.id)?.sceneId)
    .toBe(scenes.find(row => row.title === "Opening")?.id);
  expect(placements.find(row => row.encounterId === second.id)?.sceneId)
    .toBe(scenes.find(row => row.title === "Ending")?.id);
});

test("records immutable encounter snapshots and improvised play with ownership and revision checks", async () => {
  const definition = await createEncounter(db, actor, { campaignId, title: "Bridge", partyLevel: 3, partySize: 5 });
  const creature = await addEncounterCreature(db, actor, definition.id,
    { expectedRevision: 1, name: "Wight", xp: 700, quantity: 2 });
  const session = await createSession(db, actor, { campaignId, title: "Crossing" });
  const placement = await placeEncounter(db, actor, session.id,
    { expectedRevision: 1, encounterId: definition.id });
  await expect(recordEncounterRun(db, other, session.id,
    { expectedRevision: 2, placementId: placement.id, outcome: "Escaped" }))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(recordEncounterRun(db, actor, session.id,
    { expectedRevision: 2, placementId: randomUUID(), outcome: "Escaped" }))
    .rejects.toBeInstanceOf(InvalidEncounterRunInputError);
  const recorded = await recordEncounterRun(db, actor, session.id,
    { expectedRevision: 2, placementId: placement.id, outcome: "The party escaped." });
  expect(recorded.title).toBe("Bridge");
  await expect(recordEncounterRun(db, actor, session.id,
    { expectedRevision: 2, placementId: placement.id, outcome: "Duplicate" }))
    .rejects.toBeInstanceOf(SessionRevisionConflictError);
  await editEncounter(db, actor, definition.id,
    { expectedRevision: 2, title: "New bridge", partyLevel: 3, partySize: 5 });
  await editEncounterCreature(db, actor, definition.id, creature.id,
    { expectedRevision: 3, intent: "trash", name: "", xp: 0, quantity: 1 });
  await removeEncounterPlacement(db, actor, session.id, placement.id, 3);
  const improvised = await recordEncounterRun(db, actor, session.id,
    { expectedRevision: 4, title: "Unexpected ambush", outcome: "They negotiated." });
  expect(improvised.encounterId).toBeNull();
  const history = await listSessionEncounterRuns(db, actor, session.id);
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({ title: "Bridge", outcome: "The party escaped.",
    placementId: null, creatures: [{ name: "Wight", xp: 700, quantity: 2 }] });
  await expect(listSessionEncounterRuns(db, other, session.id)).rejects.toBeInstanceOf(SessionNotFoundError);
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
