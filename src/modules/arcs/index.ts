import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { arc, campaign, campaignEntity } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { ArcNotFoundError, ArcRevisionConflictError, InvalidArcInputError } from "./errors";

export * from "./errors";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields = { ...getTableColumns(campaignEntity), ...getTableColumns(arc) };
const identity = and(eq(arc.id, campaignEntity.id), eq(arc.campaignId, campaignEntity.campaignId));

function ownedArcs(db: NodePgDatabase, actor: Actor) {
  return db.select(fields).from(arc).innerJoin(campaignEntity, identity)
    .innerJoin(campaign, and(eq(campaign.id, arc.campaignId), eq(campaign.ownerUserId, actor.userId)));
}

export async function listOwnedArcs(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return ownedArcs(db, actor).where(eq(arc.campaignId, campaignId));
}

export async function getOwnedArc(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new ArcNotFoundError();
  const [row] = await ownedArcs(db, actor).where(eq(arc.id, id));
  if (!row) throw new ArcNotFoundError();
  return row;
}

function validateFields(input: { name?: string; description?: string | null }) {
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.includes("\0"))) throw new InvalidArcInputError();
  if (input.description !== undefined && input.description !== null && (typeof input.description !== "string" || input.description.includes("\0"))) throw new InvalidArcInputError();
}

export async function createArc(db: NodePgDatabase, actor: Actor, input: Readonly<{ campaignId: string; name: string; description?: string | null }>) {
  if (!isUuid(input.campaignId) || input.name === undefined) throw new InvalidArcInputError();
  validateFields(input);
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, input.campaignId);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId, entityType: "ARC", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(arc).values({ id: entity.id, campaignId: entity.campaignId, name: input.name, description: input.description }).returning();
    return { ...entity, ...typed };
  });
}

async function lockArc(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw new ArcNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaignEntity.entityType, "ARC"), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new ArcNotFoundError();
  const current = await getOwnedArc(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0 || expectedRevision > 2147483647) throw new InvalidArcInputError();
  if (current.revision !== expectedRevision) throw new ArcRevisionConflictError();
  return current;
}

const advanceRevision = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

export async function editArc(db: NodePgDatabase, actor: Actor, id: string, input: Readonly<{ expectedRevision: number; name?: string; description?: string | null }>) {
  return db.transaction(async tx => {
    const current = await lockArc(tx, actor, id, input.expectedRevision);
    validateFields(input);
    const name = input.name === undefined ? current.name : input.name;
    const description = input.description === undefined ? current.description : input.description;
    if (name === current.name && description === current.description) return current;
    await tx.update(campaignEntity).set(advanceRevision).where(eq(campaignEntity.id, id));
    await tx.update(arc).set({ name, description }).where(eq(arc.id, id));
    return getOwnedArc(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockArc(tx, actor, id, expectedRevision);
    if ((action === "archive" && current.archivedAt !== null)
      || (action === "trash" && current.deletedAt !== null)
      || (action === "restore" && current.deletedAt === null)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? {
        deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'`,
      } : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advanceRevision, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedArc(tx, actor, id);
  }, { isolationLevel: "read committed" });
}

export const archiveArc = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "archive");
export const trashArc = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "trash");
export const restoreArc = (db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) => lifecycle(db, actor, id, expectedRevision, "restore");
