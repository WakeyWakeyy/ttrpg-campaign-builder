import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, location, travelRoute } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class TravelRouteNotFoundError extends Error {}
export class TravelRouteRevisionConflictError extends Error {}
export class InvalidTravelRouteInputError extends Error {}

type Fields = { name: string; fromLocationId: string; toLocationId: string;
  distance?: string | null; duration?: string | null; mode?: string | null;
  hazards?: string | null; notes?: string | null };
export type CreateTravelRouteInput = Fields & { campaignId: string };
export type EditTravelRouteInput = Fields & { expectedRevision: number };
type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(travelRoute) };
const identity = and(eq(travelRoute.id, campaignEntity.id), eq(travelRoute.campaignId, campaignEntity.campaignId));

function ownedRoutes(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(travelRoute).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, travelRoute.campaignId), eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedTravelRoutes(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedRoutes(db, actor).where(eq(travelRoute.campaignId, campaignId));
}
export async function getOwnedTravelRoute(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new TravelRouteNotFoundError();
  const [row] = await ownedRoutes(db, actor).where(eq(travelRoute.id, id));
  if (!row) throw new TravelRouteNotFoundError();
  return row;
}
function validate(input: Fields) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0")) throw new InvalidTravelRouteInputError();
  if (!isUuid(input.fromLocationId) || !isUuid(input.toLocationId)
    || input.fromLocationId.toLowerCase() === input.toLocationId.toLowerCase()) throw new InvalidTravelRouteInputError();
  for (const value of [input.distance, input.duration, input.mode, input.hazards, input.notes]) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.includes("\0"))) throw new InvalidTravelRouteInputError();
  }
}
async function lockCampaign(tx: Transaction, actor: Actor, campaignId: string) {
  if (!isUuid(campaignId)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign).where(and(
    eq(campaign.id, campaignId), eq(campaign.ownerUserId, actor.userId),
  )).for("update");
  if (!row) throw new CampaignNotFoundError();
}
async function validateEndpoints(tx: Transaction, campaignId: string, input: Fields) {
  const rows = await tx.select({ id: location.id }).from(location).innerJoin(campaignEntity,
    and(eq(location.id, campaignEntity.id), eq(location.campaignId, campaignEntity.campaignId)))
    .where(and(eq(location.campaignId, campaignId), sql`${location.id} IN (${input.fromLocationId}, ${input.toLocationId})`,
      sql`${campaignEntity.deletedAt} IS NULL`));
  if (rows.length !== 2) throw new InvalidTravelRouteInputError();
}
export async function createTravelRoute(db: NodePgDatabase, actor: Actor, input: CreateTravelRouteInput) {
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    validate(input);
    await validateEndpoints(tx, input.campaignId, input);
    const [entity] = await tx.insert(campaignEntity).values({
      campaignId: input.campaignId, entityType: "TRAVEL_ROUTE", createdByUserId: actor.userId,
    }).returning();
    const [typed] = await tx.insert(travelRoute).values({
      id: entity.id, campaignId: entity.campaignId, name: input.name.trim(),
      fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
      distance: input.distance, duration: input.duration, mode: input.mode,
      hazards: input.hazards, notes: input.notes,
    }).returning();
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}
async function lockRoute(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new TravelRouteNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new TravelRouteNotFoundError();
  const current = await getOwnedTravelRoute(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647) throw new InvalidTravelRouteInputError();
  if (current.revision !== expectedRevision) throw new TravelRouteRevisionConflictError();
  return current;
}
const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };
export async function editTravelRoute(db: NodePgDatabase, actor: Actor, id: string, input: EditTravelRouteInput) {
  return db.transaction(async tx => {
    const current = await getOwnedTravelRoute(tx, actor, id);
    await lockCampaign(tx, actor, current.campaignId);
    const locked = await lockRoute(tx, actor, id, input.expectedRevision);
    if (locked.deletedAt) throw new InvalidTravelRouteInputError();
    validate(input);
    await validateEndpoints(tx, locked.campaignId, input);
    const next = { name: input.name.trim(), fromLocationId: input.fromLocationId.toLowerCase(),
      toLocationId: input.toLocationId.toLowerCase(), distance: input.distance ?? null,
      duration: input.duration ?? null, mode: input.mode ?? null, hazards: input.hazards ?? null, notes: input.notes ?? null };
    if (Object.entries(next).every(([key, value]) => locked[key as keyof typeof next] === value)) return locked;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(travelRoute).set(next).where(eq(travelRoute.id, id));
    return getOwnedTravelRoute(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockRoute(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt) || (action === "trash" && current.deletedAt)
      || (action === "restore" && !current.deletedAt)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
      : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedTravelRoute(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveTravelRoute = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "archive");
export const trashTravelRoute = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "trash");
export const restoreTravelRoute = (db: NodePgDatabase, actor: Actor, id: string, revision: number) => lifecycle(db, actor, id, revision, "restore");
