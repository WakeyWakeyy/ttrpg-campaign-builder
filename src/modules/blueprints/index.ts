import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { blueprintDraft, blueprintProposal, blueprintMaterialization, campaign, campaignCompass, campaignEntity, campaignRuleset, commandExecution, location, rulesetVersion } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";

export class BlueprintNotFoundError extends Error {}
export class BlueprintRevisionConflictError extends Error {}
export class InvalidBlueprintInputError extends Error {}
export class BlueprintReviewLockedError extends Error {}
export class BlueprintAlreadyMaterializedError extends Error {}
export class BlueprintIdempotencyConflictError extends Error {}

export type BlueprintInput = Readonly<{
  title: string;
  premise: string;
  setting: string | null;
  tone: string | null;
  proposedLocations: string[];
}>;

function validate(input: BlueprintInput) {
  if (typeof input.title !== "string" || !input.title.trim() ||
      typeof input.premise !== "string" || !input.premise.trim() ||
      (input.setting !== null && typeof input.setting !== "string") ||
      (input.tone !== null && typeof input.tone !== "string") ||
      !Array.isArray(input.proposedLocations) || input.proposedLocations.length > 20 ||
      input.proposedLocations.some(name => typeof name !== "string" || !name.trim() || name.length > 200)) {
    throw new InvalidBlueprintInputError();
  }
}

const isUuid = (value: string) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function listOwnedBlueprints(db: NodePgDatabase, actor: Actor) {
  return db.select().from(blueprintDraft).where(eq(blueprintDraft.ownerUserId, actor.userId));
}

export async function getOwnedBlueprint(db: NodePgDatabase, actor: Actor, id: string) {
  if (!isUuid(id)) throw new BlueprintNotFoundError();
  const [draft] = await db.select().from(blueprintDraft).where(and(eq(blueprintDraft.id, id), eq(blueprintDraft.ownerUserId, actor.userId)));
  if (!draft) throw new BlueprintNotFoundError();
  return draft;
}

export async function createBlueprint(db: NodePgDatabase, actor: Actor, input: BlueprintInput) {
  validate(input);
  const [created] = await db.insert(blueprintDraft).values({ ownerUserId: actor.userId, ...input }).returning();
  return created;
}

export async function editBlueprint(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number, input: BlueprintInput) {
  validate(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new InvalidBlueprintInputError();
  return db.transaction(async tx => {
    if (!isUuid(id)) throw new BlueprintNotFoundError();
    const [current] = await tx.select().from(blueprintDraft).where(and(eq(blueprintDraft.id, id), eq(blueprintDraft.ownerUserId, actor.userId))).for("update");
    if (!current) throw new BlueprintNotFoundError();
    if (current.reviewStartedAt && JSON.stringify(current.proposedLocations) !== JSON.stringify(input.proposedLocations)) throw new BlueprintReviewLockedError();
    const [materialized] = await tx.select().from(blueprintMaterialization).where(eq(blueprintMaterialization.blueprintId, id));
    if (materialized) throw new BlueprintAlreadyMaterializedError();
    const [updated] = await tx.update(blueprintDraft).set({
      ...input, revision: sql`${blueprintDraft.revision} + 1`, updatedAt: new Date(),
    }).where(and(eq(blueprintDraft.id, id), eq(blueprintDraft.ownerUserId, actor.userId), eq(blueprintDraft.revision, expectedRevision))).returning();
    if (!updated) throw new BlueprintRevisionConflictError();
    return updated;
  });
}

export async function getBlueprintReview(db: NodePgDatabase, actor: Actor, id: string) {
  const draft = await getOwnedBlueprint(db, actor, id);
  const proposals = draft.reviewStartedAt
    ? await db.select().from(blueprintProposal).where(eq(blueprintProposal.blueprintId, id)).orderBy(blueprintProposal.sortOrder)
    : [];
  const [materialization] = await db.select().from(blueprintMaterialization).where(eq(blueprintMaterialization.blueprintId, id));
  return { draft, proposals, materialization: materialization ?? null };
}

export async function startBlueprintReview(db: NodePgDatabase, actor: Actor, id: string, expectedRevision: number) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new InvalidBlueprintInputError();
  return db.transaction(async tx => {
    const [draft] = await tx.select().from(blueprintDraft).where(and(eq(blueprintDraft.id, id), eq(blueprintDraft.ownerUserId, actor.userId))).for("update");
    if (!draft) throw new BlueprintNotFoundError();
    if (draft.revision !== expectedRevision) throw new BlueprintRevisionConflictError();
    if (draft.reviewStartedAt) return draft;
    if (draft.proposedLocations.length) await tx.insert(blueprintProposal).values(draft.proposedLocations.map((name, index) => ({ blueprintId: id, name, sortOrder: index + 1 })));
    const [updated] = await tx.update(blueprintDraft).set({ reviewStartedAt: new Date(), revision: sql`${blueprintDraft.revision} + 1`, updatedAt: new Date() }).where(eq(blueprintDraft.id, id)).returning();
    return updated;
  });
}

export async function decideBlueprintProposal(db: NodePgDatabase, actor: Actor, blueprintId: string, proposalId: string, expectedRevision: number, name: string, decision: "PENDING" | "ACCEPTED" | "REJECTED") {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !isUuid(proposalId) || typeof name !== "string" || !name.trim() || name.length > 200 || !["PENDING", "ACCEPTED", "REJECTED"].includes(decision)) throw new InvalidBlueprintInputError();
  return db.transaction(async tx => {
    const [draft] = await tx.select().from(blueprintDraft).where(and(eq(blueprintDraft.id, blueprintId), eq(blueprintDraft.ownerUserId, actor.userId))).for("update");
    if (!draft || !draft.reviewStartedAt) throw new BlueprintNotFoundError();
    if (draft.revision !== expectedRevision) throw new BlueprintRevisionConflictError();
    const [materialized] = await tx.select().from(blueprintMaterialization).where(eq(blueprintMaterialization.blueprintId, blueprintId));
    if (materialized) throw new BlueprintAlreadyMaterializedError();
    const [proposal] = await tx.update(blueprintProposal).set({ name, decision }).where(and(eq(blueprintProposal.id, proposalId), eq(blueprintProposal.blueprintId, blueprintId))).returning();
    if (!proposal) throw new BlueprintNotFoundError();
    await tx.update(blueprintDraft).set({ revision: sql`${blueprintDraft.revision} + 1`, updatedAt: new Date() }).where(eq(blueprintDraft.id, blueprintId));
    return proposal;
  });
}

export async function materializeBlueprint(db: NodePgDatabase, actor: Actor, input: Readonly<{ blueprintId: string; expectedRevision: number; rulesetVersionId: string; idempotencyKey: string }>) {
  if (!isUuid(input.blueprintId) || !isUuid(input.rulesetVersionId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new InvalidBlueprintInputError();
  const fingerprint = createHash("sha256").update(JSON.stringify([input.blueprintId, input.expectedRevision, input.rulesetVersionId])).digest("hex");
  return db.transaction(async tx => {
    const inserted = await tx.insert(commandExecution).values({ scopeUserId: actor.userId, commandKind: "BLUEPRINT_MATERIALIZE", idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint, status: "IN_PROGRESS" }).onConflictDoNothing().returning({ id: commandExecution.id });
    const [execution] = await tx.select().from(commandExecution).where(and(eq(commandExecution.scopeUserId, actor.userId), eq(commandExecution.commandKind, "BLUEPRINT_MATERIALIZE"), eq(commandExecution.idempotencyKey, input.idempotencyKey), sql`${commandExecution.scopeCampaignId} IS NULL`)).for("update");
    if (!execution || execution.requestFingerprint !== fingerprint || execution.status !== "IN_PROGRESS" && execution.status !== "SUCCEEDED") throw new BlueprintIdempotencyConflictError();
    if (execution.status === "SUCCEEDED") return execution.resultJson as { campaignId: string; locationIds: string[] };
    if (!inserted.length) throw new BlueprintIdempotencyConflictError();
    const [draft] = await tx.select().from(blueprintDraft).where(and(eq(blueprintDraft.id, input.blueprintId), eq(blueprintDraft.ownerUserId, actor.userId))).for("update");
    if (!draft) throw new BlueprintNotFoundError();
    if (draft.revision !== input.expectedRevision) throw new BlueprintRevisionConflictError();
    if (!draft.reviewStartedAt) throw new InvalidBlueprintInputError();
    const [existing] = await tx.select().from(blueprintMaterialization).where(eq(blueprintMaterialization.blueprintId, draft.id));
    if (existing) throw new BlueprintAlreadyMaterializedError();
    const [version] = await tx.select().from(rulesetVersion).where(eq(rulesetVersion.id, input.rulesetVersionId));
    if (!version) throw new InvalidBlueprintInputError();
    const proposals = await tx.select().from(blueprintProposal).where(eq(blueprintProposal.blueprintId, draft.id)).orderBy(blueprintProposal.sortOrder);
    const [created] = await tx.insert(campaign).values({ ownerUserId: actor.userId, name: draft.title }).returning();
    await tx.insert(campaignRuleset).values({ campaignId: created.id, rulesetId: version.rulesetId, rulesetVersionId: version.id });
    await tx.insert(campaignCompass).values({ campaignId: created.id, originalPremise: draft.premise, currentPremise: draft.premise, setting: draft.setting, tone: draft.tone });
    const locationIds: string[] = [];
    for (const proposal of proposals.filter(row => row.decision === "ACCEPTED")) {
      const [entity] = await tx.insert(campaignEntity).values({ campaignId: created.id, entityType: "LOCATION", createdByUserId: actor.userId }).returning();
      await tx.insert(location).values({ id: entity.id, campaignId: created.id, name: proposal.name });
      locationIds.push(entity.id);
    }
    await tx.insert(blueprintMaterialization).values({ blueprintId: draft.id, campaignId: created.id, reviewedRevision: draft.revision });
    const result = { campaignId: created.id, locationIds };
    await tx.update(commandExecution).set({ status: "SUCCEEDED", completedAt: new Date(), resultSchemaVersion: 1, resultJson: result }).where(eq(commandExecution.id, execution.id));
    return result;
  }, { isolationLevel: "read committed" });
}
