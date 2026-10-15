import type { CampaignExport } from "./index";

const line = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const label = (value: unknown) => line(value).replace(/([\\[\]])/g, "\\$1");
const date = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : line(value);

/** A short GM reading sheet drawn from accepted, available campaign records. */
export function renderCampaignOverview(snapshot: CampaignExport, origin: string): string {
  const rows = snapshot.records;
  const available = new Set((rows.campaign_entity ?? [])
    .filter(entity => !entity.archived_at && !entity.deleted_at).map(entity => entity.id));
  const source = (path: string, id: unknown) => new URL(`/${path}/${encodeURIComponent(String(id))}`, origin).href;
  const out = [`# ${label(snapshot.campaign.name)}`, "", line(snapshot.campaign.description), ""];
  const compass = rows.campaign_compass?.[0];
  if (compass) {
    out.push("## Campaign compass", "");
    for (const [heading, key] of [["Premise", "current_premise"], ["Setting", "setting"], ["Tone", "tone"]] as const) {
      if (compass[key]) out.push(`**${heading}:** ${line(compass[key])}`, "");
    }
  }
  const section = (heading: string, table: string, path: string, predicate: (row: Record<string, unknown>) => boolean = () => true) => {
    const entries = (rows[table] ?? []).filter(row => available.has(row.id) && predicate(row));
    if (!entries.length) return;
    out.push(`## ${heading}`, "");
    for (const entry of entries) {
      const detail = line(entry.status ?? entry.role ?? entry.description);
      out.push(`- [${label(entry.name ?? entry.title)}](${source(path, entry.id)})${detail ? ` — ${detail}` : ""}`);
    }
    out.push("");
  };
  section("Story arcs", "arc", "arcs");
  section("Open story threads", "quest", "quests", row => row.status === "OPEN" || row.status === "POSTPONED");
  section("People", "npc", "npcs");
  section("Player characters", "player_character", "player-characters");
  section("Parties", "party", "parties");
  section("Factions", "faction", "factions");
  section("Places", "location", "locations");
  const sessions = (rows.session ?? []).filter(row => available.has(row.id))
    .sort((a, b) => date(b.planned_for).localeCompare(date(a.planned_for))).slice(0, 5);
  if (sessions.length) {
    out.push("## Sessions", "");
    for (const session of sessions) {
      const plannedFor = date(session.planned_for);
      out.push(`- [${label(session.title)}](${source("sessions", session.id)})${plannedFor ? ` — ${plannedFor}` : ""}`);
    }
    out.push("");
  }
  out.push(`[Open the full campaign workspace](${source("campaigns", snapshot.campaign.id)})`, "");
  return out.join("\n");
}
