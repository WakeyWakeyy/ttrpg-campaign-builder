import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, timelineEvent, timelineEventLink, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { createLocation } from "../../src/modules/locations";
import { archiveTimelineEvent, createTimelineEvent, editTimelineEvent, getOwnedTimelineEvent,
  InvalidTimelineEventInputError, listOwnedTimelineEvents, listTimelineEventLinks,
  restoreTimelineEvent, TimelineEventNotFoundError, TimelineEventRevisionConflictError,
  trashTimelineEvent } from "../../src/modules/timeline";

const schema = `a25_timeline_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
  }
});
beforeEach(async () => {
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id };
  other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id;
  foreignCampaignId = foreign.id;
});
afterAll(async () => {
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await pool.end(); }
});

test("creates an owned event with multiple same-campaign links and chronological fields", async () => {
  const keep = await createLocation(db, actor, { campaignId, name: "Old Keep" });
  const river = await createLocation(db, actor, { campaignId, name: "River" });
  const foreign = await createLocation(db, other, { campaignId: foreignCampaignId, name: "Foreign" });
  const input = { campaignId, title: "The crossing", description: "A pact was made.",
    occurredOn: "2026-10-07", inWorldDate: "Third day of Ember", entityIds: [keep.id, river.id] };
  await expect(createTimelineEvent(db, actor, { ...input, campaignId: foreignCampaignId }))
    .rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createTimelineEvent(db, actor, { ...input, entityIds: [foreign.id] }))
    .rejects.toBeInstanceOf(InvalidTimelineEventInputError);
  await expect(createTimelineEvent(db, actor, { ...input, occurredOn: "2026-02-30" }))
    .rejects.toBeInstanceOf(InvalidTimelineEventInputError);
  const event = await createTimelineEvent(db, actor, input);
  expect(event).toMatchObject({ entityType: "TIMELINE_EVENT", revision: 1, title: "The crossing" });
  expect(await listOwnedTimelineEvents(db, actor, campaignId)).toHaveLength(1);
  await expect(getOwnedTimelineEvent(db, other, event.id)).rejects.toBeInstanceOf(TimelineEventNotFoundError);
  expect((await listTimelineEventLinks(db, actor, event.id)).map(link => link.targetNameSnapshot).sort())
    .toEqual(["Old Keep", "River"]);
  await expect(db.insert(timelineEvent).values({ id: randomUUID(), campaignId, title: "Orphan" }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "timeline_event_entity_fk" } });
  await expect(db.insert(timelineEventLink).values({ campaignId, eventId: event.id,
    targetCampaignId: foreignCampaignId, targetEntityId: foreign.id,
    targetTypeSnapshot: "LOCATION", targetNameSnapshot: "Foreign" }))
    .rejects.toMatchObject({ cause: { code: "23514", constraint: "timeline_event_link_campaign_check" } });
});

test("revision conflicts, lifecycle, and purged links retain readable history", async () => {
  const keep = await createLocation(db, actor, { campaignId, name: "Old Keep" });
  const input = { campaignId, title: "The fall", entityIds: [keep.id] };
  const created = await createTimelineEvent(db, actor, input);
  const results = await Promise.allSettled([
    editTimelineEvent(db, actor, created.id, { ...input, title: "The battle", expectedRevision: 1 }),
    editTimelineEvent(db, actor, created.id, { ...input, title: "The siege", expectedRevision: 1 }),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected"))
    .toMatchObject({ reason: expect.any(TimelineEventRevisionConflictError) });
  const current = await getOwnedTimelineEvent(db, actor, created.id);
  const archived = await archiveTimelineEvent(db, actor, created.id, current.revision);
  const trashed = await trashTimelineEvent(db, actor, created.id, archived.revision);
  const restored = await restoreTimelineEvent(db, actor, created.id, trashed.revision);
  expect(restored).toMatchObject({ archivedAt: archived.archivedAt, deletedAt: null });
  await db.delete(campaignEntity).where(eq(campaignEntity.id, keep.id));
  const links = await listTimelineEventLinks(db, actor, created.id);
  expect(links).toMatchObject([{ targetEntityId: null, targetCampaignId: null,
    targetNameSnapshot: "Old Keep", targetTypeSnapshot: "LOCATION" }]);
  await editTimelineEvent(db, actor, created.id, { title: "Remembered fall", entityIds: [],
    expectedRevision: restored.revision });
  expect(await listTimelineEventLinks(db, actor, created.id)).toMatchObject([
    { targetEntityId: null, targetNameSnapshot: "Old Keep" },
  ]);
});
