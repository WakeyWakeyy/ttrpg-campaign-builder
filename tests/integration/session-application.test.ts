import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, session, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { archiveSession, createSession, editSession, getOwnedSession, InvalidSessionInputError,
  listOwnedSessions, restoreSession, SessionNotFoundError, SessionRevisionConflictError,
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
