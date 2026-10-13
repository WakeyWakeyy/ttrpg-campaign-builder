import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getOwnedCampaign } from "../campaigns";
import type { Actor } from "../identity";
import { collectRulesetExport, renderRulesetEncounterMarkdown } from "../rulesets/export";

// These are campaign-owned product records, not operational logs or account data.
// Keep this list explicit when adding new campaign tables so exports remain reviewable.
const campaignTables = [
  "campaign_ruleset", "campaign_compass", "campaign_intelligence_preferences",
  "campaign_compass_guideline", "campaign_entity", "location", "travel_route",
  "reward", "reward_component", "reward_grant", "encounter", "session", "scene", "encounter_placement",
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
  ruleset: { key: string; version: string; name: string };
  records: Record<string, Record<string, unknown>[]>;
};

/** A consistent, owner-scoped snapshot. No provider identity or operational records are exported. */
export async function buildCampaignExport(db: NodePgDatabase, actor: Actor, campaignId: string): Promise<CampaignExport> {
  return db.transaction(async tx => {
    const campaign = await getOwnedCampaign(tx, actor, campaignId);
    const records: CampaignExport["records"] = {};
    for (const table of campaignTables) {
      const result = await tx.execute(sql`select * from ${sql.raw(table)} where campaign_id = ${campaignId} order by 1`);
      records[table] = (result.rows as Record<string, unknown>[]).map(row => table === "campaign_entity"
        ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== "created_by_user_id"))
        : row);
    }
    for (const [table, parent, foreignKey] of childTables) {
      const result = await tx.execute(sql`select child.* from ${sql.raw(table)} child
        join ${sql.raw(parent)} parent on child.${sql.raw(foreignKey)} = parent.id
        where parent.campaign_id = ${campaignId} order by child.id`);
      records[table] = result.rows as Record<string, unknown>[];
    }
    const rulesetExport = await collectRulesetExport(tx, actor, campaignId);
    Object.assign(records, rulesetExport.records);
    const portableCampaign = Object.fromEntries(Object.entries(campaign).filter(([key]) => key !== "ownerUserId"));
    return { formatVersion: 1, campaign: portableCampaign, ruleset: rulesetExport.ruleset, records };
  }, { isolationLevel: "repeatable read" });
}

const sections = [
  ["Arcs", "arc"], ["Quests", "quest"], ["Locations", "location"],
  ["Travel routes", "travel_route"], ["NPCs", "npc"],
  ["Player characters", "player_character"], ["Parties", "party"],
  ["Factions", "faction"], ["Items", "item"], ["Relationships", "semantic_relationship"],
  ["Timeline", "timeline_event"], ["Sessions", "session"],
  ["Encounters", "encounter"], ["Rewards", "reward"], ["Reward grants", "reward_grant"], ["Clues", "clue"],
  ["Secrets (GM only)", "secret"],
] as const;

const line = (value: unknown) => value instanceof Date ? value.toISOString()
  : typeof value === "string" ? value.replace(/\r?\n/g, " ").trim() : "";
const timestamp = (value: unknown) => value ? new Date(String(value)).getTime() : Number.POSITIVE_INFINITY;
const compareTime = (a: unknown, b: unknown) => {
  const left = timestamp(a), right = timestamp(b);
  return left === right ? 0 : left < right ? -1 : 1;
};
const detailFields = [
  "description", "status", "role", "player_name", "purpose", "significance", "current_state",
  "parent_quest_id", "location_id", "npc_holder_id", "player_character_holder_id",
  "distance", "duration", "mode", "hazards", "occurred_at", "in_world_date",
  "planned_for", "preparation", "outcome", "content", "secret", "secret_id",
  "discovery_location_id", "reward_title", "recipient", "granted_at", "session_id", "notes",
] as const;
const label = (key: string) => key.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
const available = (record: Record<string, unknown>, entities: Map<unknown, Record<string, unknown>>) => {
  const entity = entities.get(record.id);
  return entity && !entity.deleted_at && !entity.archived_at;
};

/** Human-readable GM reference. JSON carries the full portable snapshot. */
export function renderCampaignMarkdown(snapshot: CampaignExport): string {
  const rows = snapshot.records;
  const entities = new Map((rows.campaign_entity ?? []).map(row => [row.id, row]));
  const entityNames = new Map<unknown, string>();
  for (const [, table] of sections) {
    for (const row of rows[table] ?? []) entityNames.set(row.id, line(row.name ?? row.title ?? row.kind));
  }
  const compass = rows.campaign_compass?.[0];
  const out = [`# ${line(snapshot.campaign.name)}`, "", line(snapshot.campaign.description), "",
    `**Ruleset:** ${snapshot.ruleset.name} (${snapshot.ruleset.key} ${snapshot.ruleset.version})`, "", "## Campaign compass", ""];
  if (compass) {
    for (const [label, key] of [["Original premise", "original_premise"], ["Current premise", "current_premise"],
      ["Setting", "setting"], ["Tone", "tone"], ["Original notes", "original_notes"]] as const) {
      if (compass[key]) out.push(`**${label}:** ${line(compass[key])}`, "");
    }
  }
  const visibleName = (id: unknown) => {
    const entity = entities.get(id);
    return entity && !entity.deleted_at && !entity.archived_at ? entityNames.get(id) : undefined;
  };
  for (const [heading, table] of sections) {
    const entries = (rows[table] ?? []).filter(row => table === "reward_grant" || available(row, entities));
    if (!entries.length) continue;
    if (table === "timeline_event" || table === "session") {
      const dateField = table === "timeline_event" ? "occurred_at" : "planned_for";
      entries.sort((a, b) => compareTime(a[dateField], b[dateField])
        || compareTime(entities.get(a.id)?.created_at, entities.get(b.id)?.created_at));
    }
    out.push(`## ${heading}`, "");
    for (const entry of entries) {
      const title = table === "semantic_relationship"
        ? `${entityNames.get(entry.source_entity_id) ?? "Unknown"} — ${line(entry.kind)} → ${entityNames.get(entry.target_entity_id) ?? "Unknown"}`
        : table === "travel_route"
          ? `${line(entry.name)}: ${entityNames.get(entry.from_location_id) ?? "Unknown"} → ${entityNames.get(entry.to_location_id) ?? "Unknown"}`
        : line(entry.name ?? entry.title ?? entry.reward_title ?? entry.kind);
      out.push(`### ${title}`, "");
      for (const key of detailFields) {
        const value = entry[key];
        if (value === null || value === undefined || value === "") continue;
        const display = key.endsWith("_id") ? entityNames.get(value) ?? String(value) : line(value) || String(value).trim();
        out.push(`**${label(key)}:** ${display}`, "");
      }
      if (table === "arc") {
        for (const link of (rows.arc_quest ?? []).filter(row => row.arc_id === entry.id)) {
          const name = visibleName(link.quest_id);
          if (name) out.push(`- Quest: ${name}`);
        }
        out.push("");
      }
      if (table === "party") {
        for (const member of (rows.party_member ?? []).filter(row => row.party_id === entry.id)) {
          const name = visibleName(member.player_character_id);
          if (name) out.push(`- Member: ${name}`);
        }
        out.push("");
      }
      if (table === "faction") {
        for (const member of (rows.faction_membership ?? []).filter(row => row.faction_id === entry.id)) {
          const name = visibleName(member.npc_id ?? member.player_character_id);
          if (name) out.push(`- Member: ${name}${member.role ? ` — ${line(member.role)}` : ""}${member.rank ? ` (${line(member.rank)})` : ""} [${line(member.status)}]`);
        }
        out.push("");
      }
      if (table === "session") {
        if (entry.attendance_set) {
          const attendees = (rows.session_attendance ?? []).filter(row => row.session_id === entry.id)
            .map(row => visibleName(row.player_character_id)).filter((name): name is string => Boolean(name));
          out.push(`**Attendance:** ${attendees.length ? attendees.join(", ") : "None recorded"}`, "");
        }
        for (const scene of (rows.scene ?? []).filter(row => row.session_id === entry.id && !row.deleted_at)
          .sort((a, b) => Number(a.position) - Number(b.position))) {
          out.push(`- **Scene: ${line(scene.title)}**`, "");
          if (scene.preparation) out.push(String(scene.preparation).trim(), "");
          if (scene.outcome) out.push(`Outcome: ${String(scene.outcome).trim()}`, "");
        }
        for (const placement of (rows.encounter_placement ?? []).filter(row => row.session_id === entry.id
          && entities.get(row.encounter_id) && !entities.get(row.encounter_id)?.deleted_at
          && !entities.get(row.encounter_id)?.archived_at
          && (!row.scene_id || (rows.scene ?? []).some(scene => scene.id === row.scene_id && !scene.deleted_at)))) {
          const scene = (rows.scene ?? []).find(row => row.id === placement.scene_id && !row.deleted_at);
          out.push(`- Planned encounter: ${entityNames.get(placement.encounter_id) ?? "Unknown"}${scene ? ` in ${line(scene.title)}` : ""}`);
        }
        for (const run of (rows.encounter_run ?? []).filter(row => row.session_id === entry.id)
          .sort((a, b) => compareTime(a.occurred_at, b.occurred_at))) {
          out.push(`- Encounter run: ${line(run.title)} (${line(run.occurred_at)})`, "");
          out.push(`  Outcome: ${line(run.outcome)}`);
          for (const creature of (rows.encounter_run_creature ?? []).filter(row => row.run_id === run.id)) {
            out.push(`  - ${creature.quantity} × ${line(creature.name)} (${creature.xp} XP each)`);
          }
          out.push("");
        }
      }
      if (table === "reward") {
        for (const component of (rows.reward_component ?? []).filter(row => row.reward_id === entry.id && !row.deleted_at)) {
          out.push(`- **${line(component.kind)}:** ${line(component.description)}`);
        }
        if ((rows.reward_component ?? []).some(row => row.reward_id === entry.id && !row.deleted_at)) out.push("");
      }
      if (table === "reward_grant") {
        for (const component of (rows.reward_grant_component ?? []).filter(row => row.grant_id === entry.id)) {
          out.push(`- **${line(component.kind)}:** ${line(component.description)}`);
        }
        out.push("");
      }
      if (table === "encounter") {
        out.push(...renderRulesetEncounterMarkdown(rows, entry.id));
      }
      if (table === "timeline_event") {
        for (const link of (rows.timeline_event_link ?? []).filter(row => row.event_id === entry.id)) {
          out.push(`- Related: ${line(link.target_type_snapshot)} — ${line(link.target_name_snapshot)}`);
        }
        out.push("");
      }
      if (table === "secret") {
        for (const knowledge of (rows.secret_knowledge ?? []).filter(row => row.secret_id === entry.id
          && entities.get(row.holder_id) && !entities.get(row.holder_id)?.deleted_at
          && !entities.get(row.holder_id)?.archived_at)) {
          out.push(`- ${entityNames.get(knowledge.holder_id) ?? "Unknown"}: ${line(knowledge.state)}${knowledge.notes ? ` — ${line(knowledge.notes)}` : ""}`);
        }
        out.push("");
      }
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
