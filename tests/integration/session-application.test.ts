import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, scene, session, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { archiveSession, createScene, createSession, editScene, editSession, getOwnedSession, InvalidSessionInputError,
  getPreviousSessionContext, listOwnedSessions, listSessionScenes, restoreSession, SceneNotFoundError, SessionNotFoundError, SessionRevisionConflictError,
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
