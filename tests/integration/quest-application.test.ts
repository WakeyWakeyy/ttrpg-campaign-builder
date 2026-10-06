import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { arcQuest, campaign, campaignEntity, quest, userAccount } from "../../src/infrastructure/db/schema";
import { createArc } from "../../src/modules/arcs";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { InvalidQuestArcError, InvalidQuestParentError, QuestNotFoundError, QuestRevisionConflictError,
  archiveQuest, createQuest, editQuest, getOwnedQuest, listQuestArcIds, restoreQuest, trashQuest } from "../../src/modules/quests";

const schema = `quest_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let stranger: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
});
beforeEach(async () => {
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, other] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id }; stranger = { userId: other.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: stranger.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id; foreignCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("Quest creation is atomic, owner scoped, and typed", async () => {
  const created = await createQuest(db, actor, { campaignId, name: "Find the key" });
  expect(created).toMatchObject({ campaignId, entityType: "QUEST", status: "OPEN", revision: 1 });
  await expect(getOwnedQuest(db, stranger, created.id)).rejects.toBeInstanceOf(QuestNotFoundError);
  await expect(createQuest(db, actor, { campaignId: foreignCampaignId, name: "Foreign" })).rejects.toBeInstanceOf(CampaignNotFoundError);
  const [wrong] = await db.insert(campaignEntity).values({ campaignId, entityType: "ARC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(quest).values({ id: wrong.id, campaignId, name: "Wrong" })).rejects.toMatchObject({ cause: { constraint: "quest_campaign_entity_fk" } });
});

test("parent and Arc links reject cross-Campaign references and cycles", async () => {
  const parent = await createQuest(db, actor, { campaignId, name: "Parent" });
  const child = await createQuest(db, actor, { campaignId, name: "Child", parentQuestId: parent.id });
  const foreign = await createQuest(db, stranger, { campaignId: foreignCampaignId, name: "Foreign" });
  const foreignArc = await createArc(db, stranger, { campaignId: foreignCampaignId, name: "Foreign arc" });
  await expect(editQuest(db, actor, parent.id, { expectedRevision: 1, parentQuestId: child.id })).rejects.toBeInstanceOf(InvalidQuestParentError);
  await expect(editQuest(db, actor, child.id, { expectedRevision: 1, parentQuestId: foreign.id })).rejects.toBeInstanceOf(InvalidQuestParentError);
  await expect(editQuest(db, actor, child.id, { expectedRevision: 1, arcIds: [foreignArc.id] })).rejects.toBeInstanceOf(InvalidQuestArcError);
  await expect(db.insert(arcQuest).values({ campaignId, arcId: foreignArc.id, questId: child.id })).rejects.toMatchObject({ cause: { constraint: "arc_quest_arc_fk" } });
});

test("revisions guard status, hierarchy and Arc membership edits", async () => {
  const arc = await createArc(db, actor, { campaignId, name: "Act one" });
  const created = await createQuest(db, actor, { campaignId, name: "Thread" });
  const changed = await editQuest(db, actor, created.id, { expectedRevision: 1, status: "POSTPONED", arcIds: [arc.id] });
  expect(changed).toMatchObject({ revision: 2, status: "POSTPONED" });
  expect(await listQuestArcIds(db, actor, created.id)).toEqual([arc.id]);
  await expect(editQuest(db, actor, created.id, { expectedRevision: 1, name: "Stale" })).rejects.toBeInstanceOf(QuestRevisionConflictError);
  expect(await editQuest(db, actor, created.id, { expectedRevision: 2, arcIds: [arc.id] })).toEqual(changed);
});

test("Archive, Trash and Restore preserve links and prior archive state", async () => {
  const arc = await createArc(db, actor, { campaignId, name: "Act one" });
  const parent = await createQuest(db, actor, { campaignId, name: "Parent" });
  const child = await createQuest(db, actor, { campaignId, name: "Child", parentQuestId: parent.id, arcIds: [arc.id] });
  const archived = await archiveQuest(db, actor, parent.id, 1);
  const trashed = await trashQuest(db, actor, parent.id, 2);
  const restored = await restoreQuest(db, actor, parent.id, 3);
  expect(trashed.purgeAfter).not.toBeNull();
  expect(restored).toMatchObject({ revision: 4, archivedAt: archived.archivedAt, deletedAt: null, purgeAfter: null });
  expect((await getOwnedQuest(db, actor, child.id)).parentQuestId).toBe(parent.id);
  expect(await listQuestArcIds(db, actor, child.id)).toEqual([arc.id]);
});
