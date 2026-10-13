import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Actor } from "../identity";
import { getCampaignRulesetVersion } from "./index";

type Rows = Record<string, Record<string, unknown>[]>;

export class UnsupportedRulesetExportError extends Error {}

/** Ruleset-specific snapshot data stays behind the pinned Ruleset boundary. */
export async function collectRulesetExport(db: NodePgDatabase, actor: Actor, campaignId: string): Promise<Rows> {
  const pinned = await getCampaignRulesetVersion(db, actor, campaignId);
  if (pinned?.rulesetKey !== "dnd-5e-2024" || pinned.version !== "5.2.1") {
    throw new UnsupportedRulesetExportError("This campaign's Ruleset Version has no export adapter.");
  }
  const records: Rows = {};
  for (const table of ["encounter_srd_521_plan", "encounter_srd_521_creature"] as const) {
    const result = await db.execute(sql`select * from ${sql.raw(table)} where campaign_id = ${campaignId} order by 1`);
    records[table] = result.rows as Record<string, unknown>[];
  }
  return records;
}

/** Formatting for SRD 5.2.1 encounter mechanics; campaign-neutral text stays in Export. */
export function renderRulesetEncounterMarkdown(records: Rows, encounterId: unknown): string[] {
  const lines: string[] = [];
  const plan = (records.encounter_srd_521_plan ?? []).find(row => row.encounter_id === encounterId);
  if (plan) lines.push(`**Party:** level ${plan.party_level}, ${plan.party_size} characters`, "");
  for (const creature of (records.encounter_srd_521_creature ?? []).filter(row => row.encounter_id === encounterId && !row.deleted_at)) {
    lines.push(`- ${creature.quantity} × ${String(creature.name).replace(/\r?\n/g, " ").trim()} (${creature.xp} XP each)`);
  }
  if (lines.length) lines.push("");
  return lines;
}
