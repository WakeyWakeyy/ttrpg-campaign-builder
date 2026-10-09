import { and, asc, eq, getTableColumns, inArray, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignEntity, timelineEvent, timelineEventLink } from "../../infrastructure/db/schema";
import { CampaignNotFoundError, getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export class TimelineEventNotFoundError extends Error {}
export class TimelineEventRevisionConflictError extends Error {}
export class InvalidTimelineEventInputError extends Error {}

type Fields = { title: string; description?: string | null; occurredOn?: string | null;
  inWorldDate?: string | null; entityIds: string[] };
export type CreateTimelineEventInput = Fields & { campaignId: string };
export type EditTimelineEventInput = Fields & { expectedRevision: number };
type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const columns = { ...getTableColumns(campaignEntity), ...getTableColumns(timelineEvent) };
const join = and(eq(timelineEvent.id, campaignEntity.id),
  eq(timelineEvent.campaignId, campaignEntity.campaignId));
const advance = { revision: sql`${campaignEntity.revision} + 1`, updatedAt: sql`clock_timestamp()` };

function owned(db: NodePgDatabase, actor: Actor) {
  return db.select(columns).from(timelineEvent).innerJoin(campaignEntity, join)
    .innerJoin(campaign, and(eq(campaign.id, timelineEvent.campaignId),
      eq(campaign.ownerUserId, actor.userId)));
}
export async function listOwnedTimelineEvents(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return owned(db, actor).where(eq(timelineEvent.campaignId, campaignId))
    .orderBy(asc(timelineEvent.occurredAt), asc(campaignEntity.createdAt));
}
export async function listCampaignTimelineEventLinks(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return db.select().from(timelineEventLink).where(eq(timelineEventLink.campaignId, campaignId));
}
export async function getOwnedTimelineEvent(db: NodePgDatabase, actor: Actor, id: string) {
  if (!uuid(id)) throw new TimelineEventNotFoundError();
  const [row] = await owned(db, actor).where(eq(timelineEvent.id, id));
  if (!row) throw new TimelineEventNotFoundError();
  return row;
}
export async function listTimelineEventLinks(db: NodePgDatabase, actor: Actor, eventId: string) {
  await getOwnedTimelineEvent(db, actor, eventId);
  return db.select().from(timelineEventLink).where(eq(timelineEventLink.eventId, eventId))
    .orderBy(asc(timelineEventLink.targetTypeSnapshot), asc(timelineEventLink.targetNameSnapshot));
}
function validate(input: Fields) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.includes("\0")
    || (input.description != null && (typeof input.description !== "string" || input.description.includes("\0")))
    || (input.inWorldDate != null && (typeof input.inWorldDate !== "string" || input.inWorldDate.includes("\0")))
    || !Array.isArray(input.entityIds) || input.entityIds.length > 50
    || input.entityIds.some(id => !uuid(id))
    || new Set(input.entityIds.map(id => id.toLowerCase())).size !== input.entityIds.length
    || (input.occurredOn != null && input.occurredOn !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn))) {
    throw new InvalidTimelineEventInputError();
  }
  if (input.occurredOn) {
    const parsed = new Date(`${input.occurredOn}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.occurredOn)
      throw new InvalidTimelineEventInputError();
  }
}
function values(input: Fields) {
  return { title: input.title.trim(), description: input.description || null,
    occurredAt: input.occurredOn ? new Date(`${input.occurredOn}T00:00:00.000Z`) : null,
    inWorldDate: input.inWorldDate?.trim() || null };
}
async function lockCampaign(tx: Transaction, actor: Actor, campaignId: string) {
  if (!uuid(campaignId)) throw new CampaignNotFoundError();
  const [row] = await tx.select({ id: campaign.id }).from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.ownerUserId, actor.userId))).for("update");
  if (!row) throw new CampaignNotFoundError();
}
type LinkSnapshot = { entityId: string; type: string; name: string };
async function linkSnapshots(tx: Transaction, campaignId: string, entityIds: string[]): Promise<LinkSnapshot[]> {
  if (!entityIds.length) return [];
  const rows = await tx.select({ id: campaignEntity.id, type: campaignEntity.entityType })
    .from(campaignEntity).where(and(eq(campaignEntity.campaignId, campaignId),
      inArray(campaignEntity.id, entityIds), sql`${campaignEntity.deletedAt} IS NULL`,
      sql`${campaignEntity.entityType} <> 'TIMELINE_EVENT'`)).for("share");
  if (rows.length !== entityIds.length) throw new InvalidTimelineEventInputError();
  const result = await tx.execute<{ id: string; type: string; name: string }>(sql`
    SELECT ce.id, ce.entity_type AS type,
      COALESCE(l.name, a.name, q.name, n.name, pc.name, p.name, f.name,
        tr.name, i.name, e.title, sr.kind) AS name
    FROM campaign_entity ce
    LEFT JOIN location l ON l.id = ce.id
    LEFT JOIN arc a ON a.id = ce.id
    LEFT JOIN quest q ON q.id = ce.id
    LEFT JOIN npc n ON n.id = ce.id
    LEFT JOIN player_character pc ON pc.id = ce.id
    LEFT JOIN party p ON p.id = ce.id
    LEFT JOIN faction f ON f.id = ce.id
    LEFT JOIN travel_route tr ON tr.id = ce.id
    LEFT JOIN item i ON i.id = ce.id
    LEFT JOIN encounter e ON e.id = ce.id
    LEFT JOIN semantic_relationship sr ON sr.id = ce.id
    WHERE ce.campaign_id = ${campaignId} AND ${inArray(sql`ce.id`, entityIds)}
  `);
  if (result.rows.length !== entityIds.length || result.rows.some(row => !row.name))
    throw new InvalidTimelineEventInputError();
  return result.rows.map(row => ({ entityId: row.id, type: row.type, name: row.name }));
}
async function replaceLinks(tx: Transaction, eventId: string, campaignId: string, snapshots: LinkSnapshot[]) {
  await tx.delete(timelineEventLink).where(and(eq(timelineEventLink.eventId, eventId),
    isNotNull(timelineEventLink.targetEntityId)));
  if (snapshots.length) await tx.insert(timelineEventLink).values(snapshots.map(snapshot => ({
    campaignId, eventId, targetCampaignId: campaignId, targetEntityId: snapshot.entityId,
    targetTypeSnapshot: snapshot.type, targetNameSnapshot: snapshot.name,
  })));
}
export async function createTimelineEvent(db: NodePgDatabase, actor: Actor, input: CreateTimelineEventInput) {
  return db.transaction(async tx => {
    await lockCampaign(tx, actor, input.campaignId);
    validate(input);
    const snapshots = await linkSnapshots(tx, input.campaignId, input.entityIds);
    const [entity] = await tx.insert(campaignEntity).values({ campaignId: input.campaignId,
      entityType: "TIMELINE_EVENT", createdByUserId: actor.userId }).returning();
    const [typed] = await tx.insert(timelineEvent).values({ id: entity.id, campaignId: entity.campaignId,
      ...values(input) }).returning();
    await replaceLinks(tx, entity.id, entity.campaignId, snapshots);
    return { ...entity, ...typed };
  }, { isolationLevel: "read committed" });
}
async function lockEvent(tx: Transaction, actor: Actor, id: string, expectedRevision: number) {
  if (!uuid(id)) throw new TimelineEventNotFoundError();
  const [entity] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
    .innerJoin(campaign, eq(campaign.id, campaignEntity.campaignId))
    .where(and(eq(campaignEntity.id, id), eq(campaign.ownerUserId, actor.userId)))
    .for("update", { of: campaignEntity });
  if (!entity) throw new TimelineEventNotFoundError();
  const current = await getOwnedTimelineEvent(tx, actor, id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647)
    throw new InvalidTimelineEventInputError();
  if (current.revision !== expectedRevision) throw new TimelineEventRevisionConflictError();
  return current;
}
export async function editTimelineEvent(db: NodePgDatabase, actor: Actor, id: string, input: EditTimelineEventInput) {
  return db.transaction(async tx => {
    const current = await getOwnedTimelineEvent(tx, actor, id);
    await lockCampaign(tx, actor, current.campaignId);
    const locked = await lockEvent(tx, actor, id, input.expectedRevision);
    if (locked.deletedAt) throw new InvalidTimelineEventInputError();
    validate(input);
    const next = values(input);
    const links = await tx.select().from(timelineEventLink).where(eq(timelineEventLink.eventId, id));
    const existingIds = links.map(link => link.targetEntityId).filter((value): value is string => value !== null).sort();
    const nextIds = input.entityIds.map(value => value.toLowerCase()).sort();
    const existing = new Map(links.filter(link => link.targetEntityId).map(link => [link.targetEntityId!.toLowerCase(), link]));
    const additions = await linkSnapshots(tx, locked.campaignId, nextIds.filter(value => !existing.has(value)));
    const snapshots = [...nextIds.filter(value => existing.has(value)).map(value => {
      const link = existing.get(value)!;
      return { entityId: value, type: link.targetTypeSnapshot, name: link.targetNameSnapshot };
    }), ...additions];
    const sameLinks = existingIds.length === nextIds.length && existingIds.every((value, index) => value === nextIds[index]);
    const sameFields = locked.title === next.title && locked.description === next.description
      && locked.inWorldDate === next.inWorldDate && locked.occurredAt?.getTime() === next.occurredAt?.getTime();
    if (sameLinks && sameFields) return locked;
    await tx.update(campaignEntity).set(advance).where(eq(campaignEntity.id, id));
    await tx.update(timelineEvent).set(next).where(eq(timelineEvent.id, id));
    if (!sameLinks) await replaceLinks(tx, id, locked.campaignId, snapshots);
    return getOwnedTimelineEvent(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
async function lifecycle(db: NodePgDatabase, actor: Actor, id: string, revision: number,
  action: "archive" | "trash" | "restore") {
  return db.transaction(async tx => {
    const current = await lockEvent(tx, actor, id, revision);
    if ((action === "archive" && current.archivedAt) || (action === "trash" && current.deletedAt)
      || (action === "restore" && !current.deletedAt)) return current;
    const change = action === "archive" ? { archivedAt: sql`statement_timestamp()` }
      : action === "trash" ? { deletedAt: sql`statement_timestamp()`,
        purgeAfter: sql`((statement_timestamp() AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC'` }
      : { deletedAt: null, purgeAfter: null };
    await tx.update(campaignEntity).set({ ...advance, ...change }).where(eq(campaignEntity.id, id));
    return getOwnedTimelineEvent(tx, actor, id);
  }, { isolationLevel: "read committed" });
}
export const archiveTimelineEvent = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "archive");
export const trashTimelineEvent = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "trash");
export const restoreTimelineEvent = (db: NodePgDatabase, actor: Actor, id: string, revision: number) =>
  lifecycle(db, actor, id, revision, "restore");
