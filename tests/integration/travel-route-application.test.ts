import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, travelRoute, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { createLocation } from "../../src/modules/locations";
import { archiveTravelRoute, createTravelRoute, editTravelRoute, getOwnedTravelRoute, InvalidTravelRouteInputError,
  listOwnedTravelRoutes, restoreTravelRoute, trashTravelRoute, TravelRouteNotFoundError, TravelRouteRevisionConflictError } from "../../src/modules/travel-routes";

const schema = `a22_route_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
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
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id };
  other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id;
  foreignCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("route creation is atomic, owner scoped, and constrained to two same-Campaign Locations", async () => {
  const from = await createLocation(db, actor, { campaignId, name: "Harbor" });
  const to = await createLocation(db, actor, { campaignId, name: "Pass" });
  const outsider = await createLocation(db, other, { campaignId: foreignCampaignId, name: "Outside" });
  const input = { campaignId, name: "Old road", fromLocationId: from.id, toLocationId: to.id, duration: "Two days" };
  await expect(createTravelRoute(db, actor, { ...input, campaignId: foreignCampaignId })).rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createTravelRoute(db, actor, { ...input, toLocationId: outsider.id })).rejects.toBeInstanceOf(InvalidTravelRouteInputError);
  await expect(createTravelRoute(db, actor, { ...input, toLocationId: from.id })).rejects.toBeInstanceOf(InvalidTravelRouteInputError);
  const created = await createTravelRoute(db, actor, input);
  expect(created).toMatchObject({ entityType: "TRAVEL_ROUTE", revision: 1, duration: "Two days" });
  expect(await listOwnedTravelRoutes(db, actor, campaignId)).toHaveLength(1);
  await expect(getOwnedTravelRoute(db, other, created.id)).rejects.toBeInstanceOf(TravelRouteNotFoundError);
  await expect(db.insert(travelRoute).values({ campaignId, id: randomUUID(), name: "Orphan", fromLocationId: from.id, toLocationId: to.id }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "travel_route_campaign_entity_fk" } });
  const [wrong] = await db.insert(campaignEntity).values({ campaignId, entityType: "NPC", createdByUserId: actor.userId }).returning();
  await expect(db.insert(travelRoute).values({ campaignId, id: wrong.id, name: "Wrong", fromLocationId: from.id, toLocationId: to.id }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "travel_route_campaign_entity_fk" } });
  const [crossCampaign] = await db.insert(campaignEntity).values({ campaignId, entityType: "TRAVEL_ROUTE", createdByUserId: actor.userId }).returning();
  await expect(db.insert(travelRoute).values({ campaignId, id: crossCampaign.id, name: "Cross campaign", fromLocationId: from.id, toLocationId: outsider.id }))
    .rejects.toMatchObject({ cause: { code: "23503", constraint: "travel_route_to_location_fk" } });
  await pool.query("ALTER TABLE travel_route ADD CONSTRAINT a22_reject_route CHECK (false) NOT VALID");
  try {
    await expect(createTravelRoute(db, actor, input)).rejects.toThrow();
    expect(await db.select().from(campaignEntity)).toHaveLength(6);
  } finally { await pool.query("ALTER TABLE travel_route DROP CONSTRAINT a22_reject_route"); }
});

test("revision conflicts and preservation lifecycle keep route details", async () => {
  const from = await createLocation(db, actor, { campaignId, name: "Harbor" });
  const to = await createLocation(db, actor, { campaignId, name: "Pass" });
  const input = { name: "Old road", fromLocationId: from.id, toLocationId: to.id, hazards: "Bandits" };
  const created = await createTravelRoute(db, actor, { campaignId, ...input });
  const outcomes = await Promise.allSettled([
    editTravelRoute(db, actor, created.id, { expectedRevision: 1, ...input, duration: "Two days" }),
    editTravelRoute(db, actor, created.id, { expectedRevision: 1, ...input, duration: "Three days" }),
  ]);
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find(result => result.status === "rejected")).toMatchObject({ reason: expect.any(TravelRouteRevisionConflictError) });
  const current = await getOwnedTravelRoute(db, actor, created.id);
  const archived = await archiveTravelRoute(db, actor, created.id, current.revision);
  const trashed = await trashTravelRoute(db, actor, created.id, archived.revision);
  const restored = await restoreTravelRoute(db, actor, created.id, trashed.revision);
  expect(restored).toMatchObject({ hazards: "Bandits", archivedAt: archived.archivedAt, deletedAt: null });
});
