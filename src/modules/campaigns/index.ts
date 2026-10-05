import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaign, campaignCompass, campaignRuleset, rulesetVersion } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";
import { CampaignNotFoundError, InvalidCampaignInputError, RulesetVersionNotFoundError } from "./errors";

export { CampaignNotFoundError, InvalidCampaignInputError, RulesetVersionNotFoundError } from "./errors";

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
