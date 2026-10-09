import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaignRuleset, ruleset, rulesetContentSource, rulesetReference, rulesetVersion } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";
import { getOwnedCampaign } from "../campaigns";

/** The single published version supported by the architecture proof. */
export async function getSupportedRulesetVersion(db: NodePgDatabase) {
  const [version] = await db.select({ id: rulesetVersion.id }).from(rulesetVersion)
    .innerJoin(ruleset, eq(ruleset.id, rulesetVersion.rulesetId))
    .where(and(eq(ruleset.key, "dnd-5e-2024"), eq(rulesetVersion.version, "5.2.1")));
  return version ?? null;
}

export async function getCampaignRulesetVersion(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  const [version] = await db.select({ rulesetKey: ruleset.key, version: rulesetVersion.version,
    name: rulesetVersion.name }).from(campaignRuleset)
    .innerJoin(rulesetVersion, eq(rulesetVersion.id, campaignRuleset.rulesetVersionId))
    .innerJoin(ruleset, eq(ruleset.id, rulesetVersion.rulesetId))
    .where(eq(campaignRuleset.campaignId, campaignId));
  return version ?? null;
}

/** Read-only reference for the version pinned by an owned Campaign. */
export async function listCampaignRulesReferences(db: NodePgDatabase, actor: Actor, campaignId: string) {
  await getOwnedCampaign(db, actor, campaignId);
  return db.select({
    sourceId: rulesetContentSource.id,
    key: rulesetReference.key,
    category: rulesetReference.category,
    title: rulesetReference.title,
    page: rulesetReference.page,
    version: rulesetVersion.name,
    sourceTitle: rulesetContentSource.title,
    sourceUrl: rulesetContentSource.sourceUrl,
    license: rulesetContentSource.license,
    licenseUrl: rulesetContentSource.licenseUrl,
    attribution: rulesetContentSource.attribution,
  }).from(campaignRuleset)
    .innerJoin(rulesetVersion, eq(rulesetVersion.id, campaignRuleset.rulesetVersionId))
    .innerJoin(rulesetContentSource, eq(rulesetContentSource.rulesetVersionId, rulesetVersion.id))
    .innerJoin(rulesetReference, eq(rulesetReference.sourceId, rulesetContentSource.id))
    .where(eq(campaignRuleset.campaignId, campaignId))
    .orderBy(rulesetReference.page);
}
