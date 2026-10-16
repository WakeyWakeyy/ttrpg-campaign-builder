import { renderCampaignMarkdown, type CampaignExport } from "./index";

const chapters = [
  { title: "Story and threads", anchor: "story-and-threads", tables: ["arc", "quest"] },
  { title: "People and groups", anchor: "people-and-groups", tables: ["npc", "player_character", "party", "faction"] },
  { title: "Places and connections", anchor: "places-and-connections", tables: ["location", "travel_route", "item", "semantic_relationship"] },
  { title: "Secrets and discovery", anchor: "secrets-and-discovery", tables: ["secret", "clue"] },
  { title: "Sessions and history", anchor: "sessions-and-history", tables: ["session", "timeline_event"] },
  { title: "Encounters and rewards", anchor: "encounters-and-rewards", tables: ["encounter", "reward", "reward_grant"] },
] as const;

/** An editorial GM document; the shared reference renderer owns record detail and lifecycle filtering. */
export function renderCampaignModule(snapshot: CampaignExport): string {
  const contents = chapters.map(chapter => ({ ...chapter, content: renderCampaignMarkdown(snapshot, {
    sectionTables: chapter.tables, includeIntroduction: false, headingOffset: 1,
  }).trim() })).filter(chapter => chapter.content);
  const introduction = renderCampaignMarkdown(snapshot, { sectionTables: [] }).trim();
  const out = [introduction, "", "**GM only:** This module includes hidden information and recorded outcomes. Keep it private.", "",
    "## Contents", "", "- [Campaign compass](#campaign-compass)",
    ...contents.map(chapter => `- [${chapter.title}](#${chapter.anchor})`), ""];
  for (const chapter of contents) out.push(`## ${chapter.title}`, "", chapter.content, "");
  if (!contents.length) out.push("No available campaign material has been recorded yet.", "");
  return out.join("\n");
}
