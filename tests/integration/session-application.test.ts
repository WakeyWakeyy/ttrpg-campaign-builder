import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, scene, session, sessionAttendance, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { createParty, listPartyMemberIds } from "../../src/modules/parties";
import { createPlayerCharacter } from "../../src/modules/player-characters";
import { archiveSession, createScene, createSession, editScene, editSession, getOwnedSession, InvalidSessionInputError,
  getPreviousSessionContext, listOwnedSessions, listSessionAttendance, listSessionScenes, recordSceneOutcome, recordSessionOutcome, restoreSession, reuseSessionPreparation, SceneNotFoundError, SessionNotFoundError, SessionRevisionConflictError, setSessionAttendance,
  trashSession } from "../../src/modules/sessions";

const schema = `a26_session_${randomUUID().replaceAll("-", "")}`;
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
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("outcome capture preserves preparation and rejects stale, foreign, or trashed writes", async () => {
  const parent = await createSession(db, actor, { campaignId, title: "Crossing", preparation: "Meet the guard" });
  const beat = await createScene(db, actor, parent.id, { expectedRevision: 1,
    title: "Gate", preparation: "Ask for passage" });
  await expect(recordSessionOutcome(db, other, parent.id, { expectedRevision: 2, outcome: "Stolen" }))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  const recorded = await recordSessionOutcome(db, actor, parent.id, { expectedRevision: 2,
    outcome: "They found another route" });
  expect(recorded).toMatchObject({ revision: 3, preparation: "Meet the guard", outcome: "They found another route" });
  await expect(recordSceneOutcome(db, actor, parent.id, beat.id, { expectedRevision: 2, outcome: "Old" }))
    .rejects.toBeInstanceOf(SessionRevisionConflictError);
  await expect(recordSceneOutcome(db, actor, parent.id, randomUUID(), { expectedRevision: 3, outcome: "Wrong" }))
    .rejects.toBeInstanceOf(SceneNotFoundError);
  const afterScene = await recordSceneOutcome(db, actor, parent.id, beat.id, { expectedRevision: 3,
    outcome: "The guard left" });
  expect(afterScene.revision).toBe(4);
  expect((await listSessionScenes(db, actor, parent.id))[0]).toMatchObject({
    preparation: "Ask for passage", outcome: "The guard left" });
  await expect(recordSessionOutcome(db, actor, parent.id, { expectedRevision: 4, outcome: "Bad\0value" }))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
  await trashSession(db, actor, parent.id, 4);
  await expect(recordSceneOutcome(db, actor, parent.id, beat.id, { expectedRevision: 5, outcome: "No" }))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
});

test("reuses available preparation in a new session without copying play history", async () => {
  const source = await createSession(db, actor, { campaignId, title: "Crossing", plannedFor: "2026-10-08",
    preparation: "Meet the guard", outcome: "The bridge fell" });
  const kept = await createScene(db, actor, source.id, { expectedRevision: 1,
    title: "Gate", preparation: "Ask for passage", outcome: "The guard fled" });
  const discarded = await createScene(db, actor, source.id, { expectedRevision: 2,
    title: "Unused", preparation: "Old plan" });
  await editScene(db, actor, source.id, discarded.id, { expectedRevision: 3, intent: "trash", title: "" });
  const character = await createPlayerCharacter(db, actor, { campaignId, name: "Mira" });
  await setSessionAttendance(db, actor, source.id, { expectedRevision: 4, playerCharacterIds: [character.id] });
  await expect(reuseSessionPreparation(db, other, source.id, 5))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(reuseSessionPreparation(db, actor, source.id, 4))
    .rejects.toBeInstanceOf(SessionRevisionConflictError);
  const copy = await reuseSessionPreparation(db, actor, source.id, 5);
  expect(copy).toMatchObject({ campaignId, title: "Copy of Crossing", preparation: "Meet the guard",
    outcome: null, plannedFor: null, attendanceSet: false, revision: 1 });
  expect(await listSessionAttendance(db, actor, copy.id)).toEqual([]);
  expect(await listSessionScenes(db, actor, copy.id)).toMatchObject([
    { title: "Gate", preparation: "Ask for passage", outcome: null, position: 1, deletedAt: null },
  ]);
  expect((await listSessionScenes(db, actor, source.id)).find(item => item.id === kept.id)?.outcome)
    .toBe("The guard fled");
  expect((await getOwnedSession(db, actor, source.id)).revision).toBe(5);
  await trashSession(db, actor, source.id, 5);
  await expect(reuseSessionPreparation(db, actor, source.id, 6))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
  expect(await listOwnedSessions(db, actor, campaignId)).toHaveLength(2);
});

test("attendance is explicit, revision-safe, campaign-bound, and independent of party membership", async () => {
  const parent = await createSession(db, actor, { campaignId, title: "Crossing" });
  const owned = await createPlayerCharacter(db, actor, { campaignId, name: "Mira" });
  const group = await createParty(db, actor, { campaignId, name: "Voyagers", playerCharacterIds: [owned.id] });
  const foreign = await createPlayerCharacter(db, other, { campaignId: foreignCampaignId, name: "Other" });
  expect(parent.attendanceSet).toBe(false);
  await expect(setSessionAttendance(db, other, parent.id, { expectedRevision: 1, playerCharacterIds: [owned.id] }))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(setSessionAttendance(db, actor, parent.id, { expectedRevision: 1, playerCharacterIds: [foreign.id] }))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
  await expect(db.insert(sessionAttendance).values({ campaignId: foreignCampaignId, sessionId: parent.id,
    playerCharacterId: foreign.id })).rejects.toMatchObject({ cause: { constraint: "session_attendance_session_fk" } });
  const recorded = await setSessionAttendance(db, actor, parent.id, { expectedRevision: 1, playerCharacterIds: [owned.id] });
  expect(recorded).toMatchObject({ attendanceSet: true, revision: 2 });
  expect(await listSessionAttendance(db, actor, parent.id)).toEqual([{ playerCharacterId: owned.id }]);
  await expect(setSessionAttendance(db, actor, parent.id, { expectedRevision: 1, playerCharacterIds: [] }))
    .rejects.toBeInstanceOf(SessionRevisionConflictError);
  const empty = await setSessionAttendance(db, actor, parent.id, { expectedRevision: 2, playerCharacterIds: [] });
  expect(empty.attendanceSet).toBe(true);
  expect(await listSessionAttendance(db, actor, parent.id)).toEqual([]);
  const reset = await setSessionAttendance(db, actor, parent.id, { expectedRevision: 3, playerCharacterIds: null });
  expect(reset.attendanceSet).toBe(false);
  expect(await listSessionAttendance(db, actor, parent.id)).toEqual([]);
  expect(await listPartyMemberIds(db, actor, group.id)).toEqual([owned.id]);
});

test("creates owner-scoped preparation atomically and preserves distinct outcome", async () => {
  await expect(createSession(db, actor, { campaignId: foreignCampaignId, title: "Stolen" }))
    .rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createSession(db, actor, { campaignId, title: "Invalid", plannedFor: "2026-02-30" }))
    .rejects.toBeInstanceOf(InvalidSessionInputError);
  const created = await createSession(db, actor, { campaignId, title: "The crossing",
    plannedFor: "2026-10-08", preparation: "Meet the ferryman" });
  expect(created).toMatchObject({ entityType: "SESSION", revision: 1, outcome: null });
  expect(await listOwnedSessions(db, actor, campaignId)).toHaveLength(1);
  await expect(getOwnedSession(db, other, created.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(db.insert(session).values({ id: randomUUID(), campaignId, title: "Orphan" }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "session_entity_fk" } });
  const edited = await editSession(db, actor, created.id, { expectedRevision: 1, title: created.title,
    plannedFor: created.plannedFor, preparation: created.preparation, outcome: "The party crossed" });
  expect(edited).toMatchObject({ revision: 2, preparation: "Meet the ferryman", outcome: "The party crossed" });
});

test("concurrent edits reject stale revisions and restore keeps archive state", async () => {
  const created = await createSession(db, actor, { campaignId, title: "Session one" });
  const edits = await Promise.allSettled([
    editSession(db, actor, created.id, { expectedRevision: 1, title: "First" }),
    editSession(db, actor, created.id, { expectedRevision: 1, title: "Second" }),
  ]);
  expect(edits.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(edits.find(result => result.status === "rejected"))
    .toMatchObject({ reason: expect.any(SessionRevisionConflictError) });
  const current = await getOwnedSession(db, actor, created.id);
  const archived = await archiveSession(db, actor, created.id, current.revision);
  const trashed = await trashSession(db, actor, created.id, archived.revision);
  const restored = await restoreSession(db, actor, created.id, trashed.revision);
  expect(restored).toMatchObject({ archivedAt: archived.archivedAt, deletedAt: null,
    preparation: null, outcome: null });
  expect(await db.select().from(campaignEntity)).toHaveLength(1);
});

test("scenes are ordered, owner-scoped, revision-safe, and recoverable", async () => {
  const parent = await createSession(db, actor, { campaignId, title: "Crossing" });
  await expect(createScene(db, other, parent.id, { expectedRevision: 1, title: "Intrusion" }))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  const first = await createScene(db, actor, parent.id, { expectedRevision: 1,
    title: "At the bridge", preparation: "Toll keeper waits" });
  const second = await createScene(db, actor, parent.id, { expectedRevision: 2, title: "Beyond" });
  expect((await listSessionScenes(db, actor, parent.id)).map(row => row.title))
    .toEqual(["At the bridge", "Beyond"]);
  await expect(listSessionScenes(db, other, parent.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(db.insert(scene).values({ campaignId: foreignCampaignId, sessionId: parent.id,
    position: 3, title: "Cross-campaign" })).rejects.toMatchObject({ cause: { constraint: "scene_session_fk" } });
  await expect(editScene(db, other, parent.id, first.id, { expectedRevision: 3, intent: "save", title: "Stolen" }))
    .rejects.toBeInstanceOf(SessionNotFoundError);
  await expect(editScene(db, actor, parent.id, randomUUID(), { expectedRevision: 3, intent: "trash", title: "" }))
    .rejects.toBeInstanceOf(SceneNotFoundError);
  const edited = await editScene(db, actor, parent.id, second.id, { expectedRevision: 3,
    intent: "save", title: "Beyond", position: 1, outcome: "The party left" });
  expect(edited).toMatchObject({ position: 1, outcome: "The party left" });
  await expect(editScene(db, actor, parent.id, first.id, { expectedRevision: 3, intent: "save", title: "Stale" }))
    .rejects.toBeInstanceOf(SessionRevisionConflictError);
  await editScene(db, actor, parent.id, first.id, { expectedRevision: 4, intent: "trash", title: "" });
  await editScene(db, actor, parent.id, first.id, { expectedRevision: 5, intent: "restore", title: "" });
  expect((await listSessionScenes(db, actor, parent.id)).find(row => row.id === first.id)).toMatchObject({
    title: "At the bridge", preparation: "Toll keeper waits", deletedAt: null,
  });
});

test("previous-session context uses the latest available session and recorded outcomes", async () => {
  const first = await createSession(db, actor, { campaignId, title: "First", outcome: "The party crossed" });
  const sceneOne = await createScene(db, actor, first.id, { expectedRevision: 1, title: "Bridge" });
  await editScene(db, actor, first.id, sceneOne.id, { expectedRevision: 2, intent: "save",
    title: "Bridge", outcome: "The toll was paid" });
  const second = await createSession(db, actor, { campaignId, title: "Second" });
  expect(await getPreviousSessionContext(db, actor, second.id)).toMatchObject({
    session: { id: first.id, outcome: "The party crossed" },
    scenes: [{ title: "Bridge", outcome: "The toll was paid" }],
  });
  await expect(getPreviousSessionContext(db, other, second.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  const current = await getOwnedSession(db, actor, first.id);
  await trashSession(db, actor, first.id, current.revision);
  expect(await getPreviousSessionContext(db, actor, second.id)).toBeNull();
});
