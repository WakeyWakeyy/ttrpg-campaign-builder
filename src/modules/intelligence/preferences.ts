import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaignIntelligencePreferences } from "../../infrastructure/db/schema";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

export type IntelligencePreferences = Readonly<{
  questContinuity: boolean;
  timelineDates: boolean;
  clueRoutes: boolean;
  secretDiscovery: boolean;
  revision: number;
}>;

const defaults: IntelligencePreferences = {
  questContinuity: true, timelineDates: true, clueRoutes: true, secretDiscovery: true, revision: 0,
};

export class IntelligencePreferencesConflictError extends Error {}
export class InvalidIntelligencePreferencesError extends Error {}

export async function getIntelligencePreferences(db: NodePgDatabase, actor: Actor, campaignId: string): Promise<IntelligencePreferences> {
  await getOwnedCampaign(db, actor, campaignId);
  const [saved] = await db.select().from(campaignIntelligencePreferences)
    .where(eq(campaignIntelligencePreferences.campaignId, campaignId));
  return saved ?? defaults;
}

export async function setIntelligencePreferences(db: NodePgDatabase, actor: Actor, campaignId: string,
  input: IntelligencePreferences): Promise<IntelligencePreferences> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0 ||
    [input.questContinuity, input.timelineDates, input.clueRoutes, input.secretDiscovery].some(value => typeof value !== "boolean")) {
    throw new InvalidIntelligencePreferencesError();
  }
  return db.transaction(async tx => {
    await getOwnedCampaign(tx, actor, campaignId);
    const settings = { questContinuity: input.questContinuity, timelineDates: input.timelineDates,
      clueRoutes: input.clueRoutes, secretDiscovery: input.secretDiscovery };
    if (input.revision === 0) {
      const [created] = await tx.insert(campaignIntelligencePreferences)
        .values({ campaignId, ...settings }).onConflictDoNothing().returning();
      if (!created) throw new IntelligencePreferencesConflictError();
      return created;
    }
    const [updated] = await tx.update(campaignIntelligencePreferences)
      .set({ ...settings, revision: sql`${campaignIntelligencePreferences.revision} + 1` })
      .where(and(eq(campaignIntelligencePreferences.campaignId, campaignId),
        eq(campaignIntelligencePreferences.revision, input.revision))).returning();
    if (!updated) throw new IntelligencePreferencesConflictError();
    return updated;
  });
}
