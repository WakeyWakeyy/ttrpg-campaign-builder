import { expect, test } from "vitest";
import { renderCampaignMarkdown, type CampaignExport } from "../../src/modules/export";

test("Markdown shows available GM material while JSON retains recoverable records", () => {
  const snapshot: CampaignExport = {
    formatVersion: 1,
    campaign: { name: "The long road", description: "A journey" },
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
      ],
      npc: [{ id: "alice", name: "Alice" }],
      location: [{ id: "village", name: "The village" }, { id: "tower", name: "The tower" }],
      semantic_relationship: [{ id: "bond", source_entity_id: "alice", target_entity_id: "village", kind: "protects" }],
      travel_route: [{ id: "road", name: "Old road", from_location_id: "village", to_location_id: "tower" }],
      timeline_event: [
        { id: "late", title: "Later", occurred_at: "2026-02-01 00:00:00+00" },
        { id: "early", title: "Earlier", occurred_at: "2026-01-01 00:00:00+00" },
      ],
      session: [
        { id: "one", title: "Arrival", preparation: "Meet the guide", outcome: "They went north" },
        { id: "two", title: "Hidden", outcome: "Do not show" },
      ],
      scene: [
        { id: "later", session_id: "one", position: 2, title: "At the gate", outcome: "The gate opened", deleted_at: null },
        { id: "first", session_id: "one", position: 1, title: "On the road", outcome: "They arrived", deleted_at: null },
      ],
    },
  };
  const markdown = renderCampaignMarkdown(snapshot);
  expect(markdown).toContain("# The long road");
  expect(markdown).toContain("Find the lost city");
  expect(markdown).toContain("The gate opened");
  expect(markdown).toContain("Alice — protects → The village");
  expect(markdown).toContain("Old road: The village → The tower");
  expect(markdown.indexOf("Earlier")).toBeLessThan(markdown.indexOf("Later"));
  expect(markdown.indexOf("On the road")).toBeLessThan(markdown.indexOf("At the gate"));
  expect(markdown.includes("Do not show")).toBe(false);
  expect(snapshot.records.session).toHaveLength(2);
});
