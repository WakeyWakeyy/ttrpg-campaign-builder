import { expect, test } from "vitest";
import { renderCampaignOverview } from "../../src/modules/export/campaign-overview";
import type { CampaignExport } from "../../src/modules/export";

test("overview links to available GM records and leaves recoverable or closed records out", () => {
  const snapshot: CampaignExport = {
    formatVersion: 1,
    campaign: { id: "campaign-1", name: "The [Long] Road", description: "A journey" },
    ruleset: { key: "srd", version: "1", name: "Rules" },
    records: {
      campaign_compass: [{ current_premise: "Find the city", setting: "The coast", tone: "Mysterious" }],
      campaign_entity: [
        { id: "open", archived_at: null, deleted_at: null },
        { id: "closed", archived_at: null, deleted_at: null },
        { id: "hidden", archived_at: "2026-01-01", deleted_at: null },
        { id: "place", archived_at: null, deleted_at: null },
        { id: "session", archived_at: null, deleted_at: null },
        { id: "removed", archived_at: null, deleted_at: "2026-01-01" },
      ],
      quest: [
        { id: "open", name: "Find [the city]", status: "OPEN" },
        { id: "closed", name: "Old quest", status: "RESOLVED" },
        { id: "hidden", name: "Archived quest", status: "OPEN" },
      ],
      location: [{ id: "place", name: "The harbor" }, { id: "removed", name: "Lost place" }],
      session: [{ id: "session", title: "Arrival", planned_for: "2026-10-15" }],
    },
  };
  const markdown = renderCampaignOverview(snapshot, "https://campaign.example");
  expect(markdown).toContain("# The \\[Long\\] Road");
  expect(markdown).toContain("Find the city");
  expect(markdown).toContain("[Find \\[the city\\]](https://campaign.example/quests/open)");
  expect(markdown).toContain("[The harbor](https://campaign.example/locations/place)");
  expect(markdown).toContain("[Arrival](https://campaign.example/sessions/session) — 2026-10-15");
  expect(markdown).toContain("https://campaign.example/campaigns/campaign-1");
  expect(markdown).not.toMatch(/Old quest|Archived quest|Lost place/);
});

test("overview keeps recently created undated sessions when limiting the list", () => {
  const snapshot: CampaignExport = {
    formatVersion: 1,
    campaign: { id: "campaign-1", name: "The road" },
    ruleset: { key: "srd", version: "1", name: "Rules" },
    records: {
      campaign_entity: Array.from({ length: 6 }, (_, index) => ({
        id: `session-${index}`, archived_at: null, deleted_at: null,
        created_at: new Date(`2026-10-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
      })),
      session: Array.from({ length: 6 }, (_, index) => ({ id: `session-${index}`, title: `Session ${index}` })),
    },
  };
  const markdown = renderCampaignOverview(snapshot, "https://campaign.example");
  expect(markdown).toContain("Session 5");
  expect(markdown).not.toContain("Session 0");
});
