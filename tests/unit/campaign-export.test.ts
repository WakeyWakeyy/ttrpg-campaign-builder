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
      ],
      session: [
        { id: "one", title: "Arrival", preparation: "Meet the guide", outcome: "They went north" },
        { id: "two", title: "Hidden", outcome: "Do not show" },
      ],
      scene: [{ id: "scene", session_id: "one", title: "At the gate", outcome: "The gate opened", deleted_at: null }],
    },
  };
  const markdown = renderCampaignMarkdown(snapshot);
  expect(markdown).toContain("# The long road");
  expect(markdown).toContain("Find the lost city");
  expect(markdown).toContain("The gate opened");
  expect(markdown).not.toContain("Do not show");
  expect(snapshot.records.session).toHaveLength(2);
});
