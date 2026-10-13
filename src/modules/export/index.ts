import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";

// These are campaign-owned product records, not operational logs or account data.
// Keep this list explicit when adding new campaign tables so exports remain reviewable.
const campaignTables = [
  "campaign_ruleset", "campaign_compass", "campaign_intelligence_preferences",
  "campaign_compass_guideline", "campaign_entity", "location", "travel_route",
  "reward", "reward_component", "reward_grant", "encounter", "encounter_srd_521_plan",
  "encounter_srd_521_creature", "session", "scene", "encounter_placement",
  "encounter_run", "arc", "npc", "player_character", "party", "party_member",
  "session_attendance", "faction", "faction_membership", "quest", "arc_quest",
  "timeline_event", "timeline_event_link", "semantic_relationship", "item",
  "secret", "secret_knowledge", "clue",
] as const;

const childTables = [
  ["reward_grant_component", "reward_grant", "grant_id"],
  ["encounter_run_creature", "encounter_run", "run_id"],
] as const;

export type CampaignExport = {
  formatVersion: 1;
  campaign: Record<string, unknown>;
  records: Record<string, Record<string, unknown>[]>;
};

/** A consistent, owner-scoped snapshot. No provider identity or operational records are exported. */
export async function buildCampaignExport(db: NodePgDatabase, actor: Actor, campaignId: string): Promise<CampaignExport> {
  return db.transaction(async tx => {
    const campaign = await getOwnedCampaign(tx, actor, campaignId);
    const records: CampaignExport["records"] = {};
    for (const table of campaignTables) {
      const result = await tx.execute(sql`select * from ${sql.raw(table)} where campaign_id = ${campaignId} order by 1`);
      records[table] = result.rows as Record<string, unknown>[];
    }
    for (const [table, parent, foreignKey] of childTables) {
      const result = await tx.execute(sql`select child.* from ${sql.raw(table)} child
        join ${sql.raw(parent)} parent on child.${sql.raw(foreignKey)} = parent.id
        where parent.campaign_id = ${campaignId} order by child.id`);
      records[table] = result.rows as Record<string, unknown>[];
    }
    const portableCampaign = Object.fromEntries(Object.entries(campaign).filter(([key]) => key !== "ownerUserId"));
    return { formatVersion: 1, campaign: portableCampaign, records };
  }, { isolationLevel: "repeatable read" });
}

const sections = [
  ["Arcs", "arc"], ["Quests", "quest"], ["Locations", "location"],
  ["Travel routes", "travel_route"], ["NPCs", "npc"],
  ["Player characters", "player_character"], ["Parties", "party"],
  ["Factions", "faction"], ["Items", "item"], ["Relationships", "semantic_relationship"],
  ["Timeline", "timeline_event"], ["Sessions", "session"],
  ["Encounters", "encounter"], ["Rewards", "reward"], ["Clues", "clue"],
  ["Secrets (GM only)", "secret"],
] as const;

const line = (value: unknown) => typeof value === "string" ? value.replace(/\r?\n/g, " ").trim() : "";
const available = (record: Record<string, unknown>, entities: Map<unknown, Record<string, unknown>>) => {
  const entity = entities.get(record.id);
  return entity && !entity.deleted_at && !entity.archived_at;
};

/** Human-readable GM reference. JSON carries the full portable snapshot. */
export function renderCampaignMarkdown(snapshot: CampaignExport): string {
  const rows = snapshot.records;
  const entities = new Map((rows.campaign_entity ?? []).map(row => [row.id, row]));
  const compass = rows.campaign_compass?.[0];
  const out = [`# ${line(snapshot.campaign.name)}`, "", line(snapshot.campaign.description), "", "## Campaign compass", ""];
  if (compass) {
    for (const [label, key] of [["Premise", "current_premise"], ["Setting", "setting"], ["Tone", "tone"]] as const) {
      if (compass[key]) out.push(`**${label}:** ${line(compass[key])}`, "");
    }
  }
  for (const [heading, table] of sections) {
    const entries = (rows[table] ?? []).filter(row => available(row, entities));
    if (!entries.length) continue;
    out.push(`## ${heading}`, "");
    for (const entry of entries) {
      out.push(`### ${line(entry.name ?? entry.title ?? entry.kind)}`, "");
      for (const key of ["description", "content", "secret", "current_state", "preparation", "outcome", "notes"]) {
        if (entry[key]) out.push(`**${key.replaceAll("_", " ")}:** ${String(entry[key]).trim()}`, "");
      }
      if (table === "session") {
        for (const scene of (rows.scene ?? []).filter(row => row.session_id === entry.id && !row.deleted_at)) {
          out.push(`- **Scene: ${line(scene.title)}**`, "");
          if (scene.preparation) out.push(String(scene.preparation).trim(), "");
          if (scene.outcome) out.push(`Outcome: ${String(scene.outcome).trim()}`, "");
        }
      }
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
