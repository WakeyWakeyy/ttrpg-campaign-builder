import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, location } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { InvalidLocationInputError, InvalidLocationParentError, LocationNotFoundError, LocationRevisionConflictError } from "./errors";

export * from "./errors";

export type CreateLocationInput = Readonly<{
  campaignId: string;
  name: string;
  description?: string | null;
  parentLocationId?: string | null;
}>;
export type EditLocationInput = Readonly<{
  expectedRevision: number;
  name?: string;
  description?: string | null;
  parentLocationId?: string | null;
}>;
type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(location) };
const identity = and(eq(location.id, campaignEntity.id), eq(location.campaignId, campaignEntity.campaignId));

function ownedLocations(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(location).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, location.campaignId), eq(campaign.ownerUserId, actor.userId)));
}

/** Includes active, archived and trashed Locations. Actor comes from trusted authentication. */
export async function listOwnedLocations(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedLocations(db, actor).where(eq(location.campaignId, campaignId));
}

export async function getOwnedLocation(db: NodePgDatabase, actor: Actor, locationId: string) {
  if (!isUuid(locationId)) throw new LocationNotFoundError();
  const [row] = await ownedLocations(db, actor).where(eq(location.id, locationId));
  if (!row) throw new LocationNotFoundError();
  return row;
}

async function lockCampaign(tx: Transaction, actor: Actor, campaignId: string) {
  if (!isUuid(campaignId)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign).where(and(
    eq(campaign.id, campaignId), eq(campaign.ownerUserId, actor.userId),
  )).for("update");
  if (!row) throw new CampaignNotFoundError();
}

function validateFields(input: Omit<EditLocationInput, "expectedRevision">) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) {
    throw new InvalidLocationInputError("name");
  }
  if (input.description !== undefined && input.description !== null
    && (typeof input.description !== "string" || input.description.includes("\0"))) {
    throw new InvalidLocationInputError("description");
  }
}

// Called only after locking the Campaign, at READ COMMITTED. UNION also bounds
// traversal if pre-existing data was written outside the application protocol.
async function validateParent(tx: Transaction, campaignId: string, parentId: string | null | undefined, childId?: string) {
  if (parentId == null) return;
  if (!isUuid(parentId)) throw new InvalidLocationParentError();
  const [parent] = await tx.select({ id: location.id }).from(location).where(and(
    eq(location.id, parentId), eq(location.campaignId, campaignId),
  ));
  if (!parent) throw new InvalidLocationParentError();
  if (childId) {
    const ancestors = await tx.execute(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_location_id FROM location WHERE campaign_id = ${campaignId} AND id = ${parentId}
        UNION
        SELECT l.id, l.parent_location_id FROM location l JOIN ancestors a ON l.id = a.parent_location_id
        WHERE l.campaign_id = ${campaignId}
      ) SELECT id FROM ancestors WHERE id = ${childId}`);
    if (ancestors.rows.length) throw new InvalidLocationParentError();
  }
}

/** Owns registry + subtype creation; authoritative fields are never copied from input. */
export async function createLocation(db: NodePgDatabase, actor: Actor, input: CreateLocationInput) {
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    if (input.name === undefined) throw new InvalidLocationInputError("name");
    validateFields(input);
    await validateParent(tx, input.campaignId, input.parentLocationId);
    const [entity] = await tx.insert(campaignEntity).values({
      campaignId: input.campaignId, entityType: "LOCATION", createdByUserId: actor.userId,
    }).returning();
    const [typed] = await tx.insert(location).values({
      id: entity.id, campaignId: entity.campaignId, name: input.name,
      description: input.description, parentLocationId: input.parentLocationId,
    }).returning();
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}

async function lockLocation(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new LocationNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new LocationNotFoundError();
  // A separate statement sees typed state committed by a writer we waited for.
  const current = await getOwnedLocation(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) {
    throw new InvalidLocationInputError("expectedRevision");
  }
  if (current.revision !== expectedRevision) throw new LocationRevisionConflictError();
  return current;
}

const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

export async function editLocation(db: NodePgDatabase, actor: Actor, id: string, input: EditLocationInput) {
  return db.transaction(async tx => {
    // Lock ordering is Campaign then entity for every hierarchy operation.
    if (input.parentLocationId !== undefined) {
      const owned = await getOwnedLocation(tx, actor, id);
      await lockCampaign(tx, actor, owned.campaignId);
    }
    const current = await lockLocation(tx, actor, id, input.expectedRevision);
    validateFields(input);
    const next = {
      name: input.name === undefined ? current.name : input.name,
      description: input.description === undefined ? current.description : input.description,
      parentLocationId: input.parentLocationId === undefined ? current.parentLocationId : input.parentLocationId,
    };
    await validateParent(tx, current.campaignId, input.parentLocationId, id);
    // PostgreSQL UUIDs are case-insensitive; compare their canonical form.
    if (next.parentLocationId) next.parentLocationId = next.parentLocationId.toLowerCase();
    if (next.name === current.name && next.description === current.description && next.parentLocationId === current.parentLocationId) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(location).set(next).where(eq(location.id, id));
    return getOwnedLocation(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockLocation(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt !== null)
      || (action === "trash" && current.deletedAt !== null)
      || (action === "restore" && current.deletedAt === null)) return current;
    // statement_timestamp is stable within the statement; UTC arithmetic matches
    // the retention constraint even on sessions using a DST-observing time zone.
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? {
        deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'`,
      } : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedLocation(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

export const archiveLocation = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "archive");
export const trashLocation = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "trash");
export const restoreLocation = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "restore");
