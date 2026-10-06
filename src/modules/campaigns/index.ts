import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignCompass, campaignRuleset, rulesetVersion } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";
import { CampaignNotFoundError, CompassRevisionConflictError, InvalidCampaignInputError, RulesetVersionNotFoundError } from "./errors";

export { CampaignNotFoundError, CompassRevisionConflictError, InvalidCampaignInputError, RulesetVersionNotFoundError } from "./errors";

export type CreateCampaignInput = Readonly<{
  name: string;
  description?: string;
  rulesetVersionId: string;
  originalPremise: string;
  setting?: string;
  tone?: string;
  originalNotes?: string;
}>;

const isUuid = (value: string) => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Actor must come from the trusted authentication boundary. Includes all lifecycle states. */
export async function listOwnedCampaigns(db: NodePgDatabase, actor: Actor) {
  return db.select().from(campaign).where(eq(campaign.ownerUserId, actor.userId));
}

export async function getOwnedCampaign(db: NodePgDatabase, actor: Actor, campaignId: string) {
  if (!isUuid(campaignId)) throw new CampaignNotFoundError();
  const [owned] = await db.select().from(campaign).where(and(
    eq(campaign.id, campaignId),
    eq(campaign.ownerUserId, actor.userId),
  ));
  if (!owned) throw new CampaignNotFoundError();
  return owned;
}

export async function getOwnedCompass(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  const [compass] = await db.select().from(campaignCompass).where(eq(campaignCompass.campaignId, campaignId));
  if (!compass) throw new CampaignNotFoundError();
  return compass;
}

export type EditCompassInput = Readonly<{
  expectedRevision: number;
  currentPremise: string;
  setting: string | null;
  tone: string | null;
}>;

/** Original premise and notes are preserved as authored at creation. */
export async function editCompass(db: NodePgDatabase, actor: Actor, campaignId: string, input: EditCompassInput) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
    typeof input.currentPremise !== "string" || !input.currentPremise.trim() ||
    (input.setting !== null && typeof input.setting !== "string") ||
    (input.tone !== null && typeof input.tone !== "string")) {
    throw new InvalidCampaignInputError("currentPremise");
  }
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, campaignId);
    const [updated] = await tx.update(campaignCompass).set({
      currentPremise: input.currentPremise,
      setting: input.setting,
      tone: input.tone,
      revision: sql`${campaignCompass.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(campaignCompass.campaignId, campaignId), eq(campaignCompass.revision, input.expectedRevision))).returning();
    if (!updated) throw new CompassRevisionConflictError();
    return updated;
  });
}

/** Owns the complete transaction; pass the database and an authenticated Actor. */
export async function createCampaign(db: NodePgDatabase, actor: Actor, input: CreateCampaignInput) {
  for (const field of ["name", "originalPremise"] as const) {
    if (typeof input[field] !== "string" || !input[field].trim()) {
      throw new InvalidCampaignInputError(field);
    }
  }
  if (!isUuid(input.rulesetVersionId)) throw new RulesetVersionNotFoundError();

  return db.transaction(async tx => {
    const [version] = await tx.select().from(rulesetVersion)
      .where(eq(rulesetVersion.id, input.rulesetVersionId));
    if (!version) throw new RulesetVersionNotFoundError();

    const [created] = await tx.insert(campaign).values({
      ownerUserId: actor.userId,
      name: input.name,
      description: input.description,
    }).returning();
    await tx.insert(campaignRuleset).values({
      campaignId: created.id,
      rulesetId: version.rulesetId,
      rulesetVersionId: version.id,
    });
    await tx.insert(campaignCompass).values({
      campaignId: created.id,
      originalPremise: input.originalPremise,
      currentPremise: input.originalPremise,
      setting: input.setting,
      tone: input.tone,
      originalNotes: input.originalNotes,
    });
    return created;
  });
}
