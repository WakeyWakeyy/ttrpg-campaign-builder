import { expect, test } from "vitest";
import { renderCampaignMarkdown, type CampaignExport } from "../../src/modules/export";

test("Markdown shows available GM material while JSON retains recoverable records", () => {
  const snapshot: CampaignExport = {
    formatVersion: 1,
    campaign: { name: "The long road", description: "A journey" },
    ruleset: { key: "dnd-5e-2024", version: "5.2.1", name: "SRD 5.2.1" },
    records: {
      campaign_compass: [{ current_premise: "Find the lost city", setting: "The coast", tone: "Mysterious" }],
      campaign_entity: [
        { id: "one", archived_at: null, deleted_at: null },
        { id: "two", archived_at: "2026-01-01", deleted_at: null },
        { id: "alice", archived_at: null, deleted_at: null },
        { id: "village", archived_at: null, deleted_at: null },
        { id: "tower", archived_at: null, deleted_at: null },
        { id: "bond", archived_at: null, deleted_at: null },
        { id: "road", archived_at: null, deleted_at: null },
        { id: "late", archived_at: null, deleted_at: null, created_at: "2026-01-01T00:00:00Z" },
        { id: "early", archived_at: null, deleted_at: null, created_at: "2026-01-02T00:00:00Z" },
        { id: "quest", archived_at: null, deleted_at: null },
        { id: "gift", archived_at: null, deleted_at: null },
        { id: "fight", archived_at: null, deleted_at: null },
        { id: "truth", archived_at: null, deleted_at: null },
        { id: "third", archived_at: null, deleted_at: null, created_at: "2026-01-03T00:00:00Z" },
      ],
      npc: [{ id: "alice", name: "Alice", role: "Guide" }],
      quest: [{ id: "quest", name: "Find the city", status: "OPEN" }],
      reward: [{ id: "gift", title: "The king's thanks" }],
      reward_component: [{ reward_id: "gift", kind: "FAVOR", description: "A royal audience", deleted_at: null }],
      reward_grant: [{ id: "grant", reward_title: "The king's thanks", recipient: "Alice", granted_at: new Date("2026-03-01T00:00:00Z") }],
      reward_grant_component: [{ grant_id: "grant", kind: "ITEM", description: "Silver key" }],
      encounter: [{ id: "fight", title: "Bridge fight" }],
      encounter_srd_521_plan: [{ encounter_id: "fight", party_level: 5, party_size: 4 }],
      encounter_srd_521_creature: [{ encounter_id: "fight", name: "Bandit", xp: 50, quantity: 3, deleted_at: null }],
      encounter_placement: [
        { session_id: "one", encounter_id: "fight", scene_id: "first" },
        { session_id: "one", encounter_id: "fight", scene_id: "gone" },
      ],
      encounter_run: [{ id: "run", session_id: "one", title: "Bridge fight", outcome: "The party escaped", occurred_at: new Date("2026-01-02T00:00:00Z") }],
      encounter_run_creature: [{ run_id: "run", name: "Veteran", xp: 700, quantity: 1 }],
      secret: [{ id: "truth", title: "The king's plan", content: "A hidden pact" }],
      secret_knowledge: [{ secret_id: "truth", holder_id: "alice", state: "SUSPECTED", notes: "Saw the seal" }],
      location: [{ id: "village", name: "The village" }, { id: "tower", name: "The tower" }],
      semantic_relationship: [{ id: "bond", source_entity_id: "alice", target_entity_id: "village", kind: "protects" }],
      travel_route: [{ id: "road", name: "Old road", from_location_id: "village", to_location_id: "tower", distance: "Three days" }],
      timeline_event: [
        { id: "late", title: "Later", occurred_at: new Date("2026-02-01T00:00:00Z") },
        { id: "early", title: "Earlier", occurred_at: "2026-01-01 00:00:00+00" },
      ],
      timeline_event_link: [{ event_id: "early", target_type_snapshot: "NPC", target_name_snapshot: "The guide" }],
      session: [
        { id: "one", title: "Arrival", planned_for: "2026-01-01", preparation: "Meet the guide", outcome: "They went north" },
        { id: "two", title: "Hidden", outcome: "Do not show" },
        { id: "third", title: "Before arrival", planned_for: "2025-12-31" },
      ],
      scene: [
        { id: "later", session_id: "one", position: 2, title: "At the gate", outcome: "The gate opened", deleted_at: null },
        { id: "first", session_id: "one", position: 1, title: "On the road", outcome: "They arrived", deleted_at: null },
        { id: "gone", session_id: "one", position: 3, title: "Removed scene", deleted_at: "2026-01-01" },
      ],
    },
  };
  const markdown = renderCampaignMarkdown(snapshot);
  expect(markdown).toContain("# The long road");
  expect(markdown).toContain("Find the lost city");
  expect(markdown).toContain("The gate opened");
  expect(markdown).toContain("Alice — protects → The village");
  expect(markdown).toContain("Old road: The village → The tower");
  expect(markdown).toContain("**Role:** Guide");
  expect(markdown).toContain("**Status:** OPEN");
  expect(markdown).toContain("**Occurred at:** 2026-02-01T00:00:00.000Z");
  expect(markdown).toContain("**Planned for:** 2026-01-01");
  expect(markdown).toContain("**Distance:**");
  expect(markdown).toContain("**FAVOR:** A royal audience");
  expect(markdown).toContain("**Party:** level 5, 4 characters");
  expect(markdown).toContain("3 × Bandit (50 XP each)");
  expect(markdown).toContain("**Recipient:** Alice");
  expect(markdown).toContain("**Granted at:** 2026-03-01T00:00:00.000Z");
  expect(markdown).toContain("**ITEM:** Silver key");
  expect(markdown).toContain("Related: NPC — The guide");
  expect(markdown).toContain("Planned encounter: Bridge fight in On the road");
  expect(markdown.split("Planned encounter: Bridge fight")).toHaveLength(2);
  expect(markdown).toContain("Encounter run: Bridge fight");
  expect(markdown).toContain("Bridge fight (2026-01-02T00:00:00.000Z)");
  expect(markdown).toContain("1 × Veteran (700 XP each)");
  expect(markdown).toContain("Alice: SUSPECTED — Saw the seal");
  expect(markdown.indexOf("Earlier")).toBeLessThan(markdown.indexOf("Later"));
  expect(markdown.indexOf("Before arrival")).toBeLessThan(markdown.indexOf("Arrival"));
  expect(markdown.indexOf("On the road")).toBeLessThan(markdown.indexOf("At the gate"));
  expect(markdown.includes("Do not show")).toBe(false);
  expect(snapshot.records.session).toHaveLength(3);
});
