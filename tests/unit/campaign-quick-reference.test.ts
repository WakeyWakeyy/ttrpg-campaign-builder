import { expect, test } from "vitest";
import { renderCampaignQuickReference } from "../../src/modules/export/campaign-quick-reference";
import type { CampaignExport } from "../../src/modules/export";

const snapshot: CampaignExport = {
  formatVersion: 1, campaign: { id: "coast", name: "The coast" },
  ruleset: { key: "srd", version: "1", name: "Rules" },
  records: {
    campaign_entity: [...["npc", "pc", "party", "faction", "port", "route", "item"].map(id => ({ id })),
      { id: "archived", archived_at: "2026-10-01" }, { id: "trashed", deleted_at: "2026-10-01" }],
    npc: [{ id: "npc", name: "Captain", role: "Guide", current_state: "Waiting" }, { id: "archived", name: "Hidden captain" }],
    player_character: [{ id: "pc", name: "Mira", player_name: "Alex", current_state: "Ready" }, { id: "trashed", name: "Lost PC" }],
    party: [{ id: "party", name: "Voyagers" }],
    party_member: [{ party_id: "party", player_character_id: "pc" }, { party_id: "party", player_character_id: "trashed" }],
    faction: [{ id: "faction", name: "Watch", purpose: "Protect the port" }],
    location: [{ id: "port", name: "Port", parent_location_id: "archived" }, { id: "archived", name: "Hidden island" }],
    travel_route: [{ id: "route", name: "Ferry", from_location_id: "port", to_location_id: "trashed",
      distance: "3 miles", duration: "1 hour", mode: "Boat", hazards: "Storms" }],
    item: [{ id: "item", name: "Key", significance: "Opens the gate", npc_holder_id: "npc" }],
    session: [{ id: "session", title: "Arrival", preparation: "Long plan", outcome: "Long history" }],
  },
};

test("quick sheets show table details and source links without full preparation or history", () => {
  const before = JSON.stringify(snapshot);
  const result = renderCampaignQuickReference(snapshot, "https://campaign.example");
  expect(result).toContain("**GM only:**");
  expect(result).toContain("[Captain](https://campaign.example/npcs/npc) — Role: Guide; Current state: Waiting");
  expect(result).toContain("Player: Alex; Current state: Ready");
  expect(result).toContain("Members: [Mira](https://campaign.example/player-characters/pc)");
  expect(result).toContain("Purpose: Protect the port");
  expect(result).toContain("From: [Port](https://campaign.example/locations/port); To: Unavailable record");
  expect(result).toContain("Distance: 3 miles; Duration: 1 hour; Mode: Boat; Hazards: Storms");
  expect(result).toContain("Significance: Opens the gate; Held at/by: [Captain]");
  expect(result).toContain("https://campaign.example/campaigns/coast");
  expect(result).not.toMatch(/Long plan|Long history/);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("unavailable entities are omitted even when active records reference them", () => {
  const result = renderCampaignQuickReference(snapshot, "https://campaign.example");
  expect(result).not.toMatch(/Hidden captain|Lost PC|Hidden island|\/archived|\/trashed/);
  expect(result).toContain("Within: Unavailable record");
  const absent = renderCampaignQuickReference({ ...snapshot, records: { npc: [{ id: "missing", name: "Unregistered" }] } }, "https://campaign.example");
  expect(absent).not.toContain("Unregistered");
  expect(absent).toContain("No available people");
});

test("empty campaigns provide an honest empty state and a workspace link", () => {
  const result = renderCampaignQuickReference({ ...snapshot, records: {} }, "https://campaign.example");
  expect(result).toContain("No available people, groups, places, routes, or items recorded yet.");
  expect(result).not.toContain("## NPCs");
  expect(result).toContain("https://campaign.example/campaigns/coast");
});

test("multiline Markdown labels stay on one line and IDs stay inside their URL segment", () => {
  const result = renderCampaignQuickReference({ ...snapshot, campaign: { id: "a/b", name: "The\n[coast]" }, records: {
    campaign_entity: [{ id: "a/b" }], npc: [{ id: "a/b", name: "*Captain*\n[link]", role: "Guide\n## Surprise" }],
  } }, "https://campaign.example");
  expect(result).toContain("# The \\[coast\\] — Quick reference");
  expect(result).toContain("[\\*Captain\\* \\[link\\]](https://campaign.example/npcs/a%2Fb)");
  expect(result).not.toContain("\n## Surprise");
});
