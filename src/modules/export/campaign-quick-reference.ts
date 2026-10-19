import type { CampaignExport } from "./index";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
  .replace(/([\\`*_[\]<>])/g, "\\$1");

/** Compact GM reference sheets; the full module retains longer preparation and history. */
export function renderCampaignQuickReference(snapshot: CampaignExport, origin: string): string {
  const rows = snapshot.records;
  const available = new Set((rows.campaign_entity ?? [])
    .filter(row => !row.archived_at && !row.deleted_at).map(row => row.id));
  const sections = [
    ["NPCs", "npc", "npcs"], ["Player characters", "player_character", "player-characters"],
    ["Parties", "party", "parties"], ["Factions", "faction", "factions"],
    ["Locations", "location", "locations"], ["Travel routes", "travel_route", "travel-routes"],
    ["Items", "item", "items"],
  ] as const;
  const sources = new Map<unknown, { row: Row; path: string }>();
  for (const [, table, path] of sections) {
    for (const row of rows[table] ?? []) if (available.has(row.id)) sources.set(row.id, { row, path });
  }
  const source = (path: string, id: unknown) => new URL(`/${path}/${encodeURIComponent(String(id))}`, origin).href;
  const link = (id: unknown) => {
    const entry = sources.get(id);
    return entry ? `[${text(entry.row.name)}](${source(entry.path, id)})` : "Unavailable record";
  };
  const out = [`# ${text(snapshot.campaign.name)} — Quick reference`, "",
    "**GM only:** These sheets may contain private campaign information.", ""];
  for (const [heading, table] of sections) {
    const entries = (rows[table] ?? []).filter(row => available.has(row.id));
    if (!entries.length) continue;
    out.push(`## ${heading}`, "");
    for (const row of entries) {
      const details: string[] = [];
      const add = (label: string, value: unknown) => { if (text(value)) details.push(`${label}: ${text(value)}`); };
      if (table === "npc") add("Role", row.role);
      if (table === "player_character") add("Player", row.player_name);
      add("Current state", row.current_state);
      if (table === "faction") add("Purpose", row.purpose);
      if (table === "party") {
        const members = (rows.party_member ?? []).filter(member => member.party_id === row.id && sources.has(member.player_character_id));
        if (members.length) details.push(`Members: ${members.map(member => link(member.player_character_id)).join(", ")}`);
      }
      if (table === "location" && row.parent_location_id) details.push(`Within: ${link(row.parent_location_id)}`);
      if (table === "travel_route") {
        details.push(`From: ${link(row.from_location_id)}; To: ${link(row.to_location_id)}`);
        add("Distance", row.distance); add("Duration", row.duration); add("Mode", row.mode); add("Hazards", row.hazards);
      }
      if (table === "item") {
        add("Significance", row.significance);
        const holder = row.location_id ?? row.npc_holder_id ?? row.player_character_holder_id;
        if (holder) details.push(`Held at/by: ${link(holder)}`);
      }
      out.push(`- ${link(row.id)}${details.length ? ` — ${details.join("; ")}` : ""}`);
    }
    out.push("");
  }
  if (!sources.size) out.push("No available people, groups, places, routes, or items recorded yet.", "");
  out.push(`[Open the campaign workspace](${source("campaigns", snapshot.campaign.id)})`, "");
  return out.join("\n");
}
