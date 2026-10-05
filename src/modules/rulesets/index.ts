import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ruleset, rulesetVersion } from "../../infrastructure/db/schema";

/** The single published version supported by the architecture proof. */
export async function getSupportedRulesetVersion(db: NodePgDatabase) {
  const [version] = await db.select({ id: rulesetVersion.id }).from(rulesetVersion)
    .innerJoin(ruleset, eq(ruleset.id, rulesetVersion.rulesetId))
    .where(and(eq(ruleset.key, "dnd-5e-2024"), eq(rulesetVersion.version, "5.2.1")));
  return version ?? null;
}
