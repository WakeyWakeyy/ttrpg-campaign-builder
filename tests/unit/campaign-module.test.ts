import { expect, test } from "vitest";
import { renderCampaignModule } from "../../src/modules/export/campaign-module";
import { renderCampaignMarkdown, type CampaignExport } from "../../src/modules/export";

const snapshot: CampaignExport = {
  formatVersion: 1, campaign: { name: "The coast" }, ruleset: { key: "srd", version: "1", name: "Rules" },
  records: {
    campaign_compass: [{ current_premise: "Find the lost port" }],
    campaign_entity: [...["quest", "npc", "secret", "session"].map(id => ({ id })),
      { id: "archived", archived_at: "2026-01-01" }, { id: "trashed", deleted_at: "2026-01-01" }],
    quest: [{ id: "quest", name: "Find\nthe port", status: "RESOLVED", description: "The search" }],
    npc: [{ id: "npc", name: "The captain", description: "Knows the coast" }, { id: "archived", name: "Old NPC" }],
    secret: [{ id: "secret", name: "The truth", content: "The port is submerged" }, { id: "trashed", name: "Lost secret" }],
    session: [{ id: "session", title: "Arrival", preparation: "Meet the captain", outcome: "The ship sank" }],
    scene: [{ id: "scene", session_id: "session", title: "At sea", position: 1, preparation: "Watch the horizon", outcome: "A storm" },
      { id: "removed", session_id: "session", title: "Removed scene", deleted_at: "2026-01-01" }],
    reward_grant: [{ id: "grant", reward_title: "Old favor", recipient: "The party" }],
  },
};

test("module indexes populated chapters and keeps full plans, outcomes and historical grants", () => {
  const before = JSON.stringify(snapshot);
  const result = renderCampaignModule(snapshot);
  expect(result).toContain("**GM only:**");
  expect(result).toContain("- [Story and threads](#story-and-threads)");
  expect(result).not.toContain("[Places and connections]");
  expect(result.indexOf("## Story and threads")).toBeLessThan(result.indexOf("## People and groups"));
  expect(result).toContain("#### Find the port");
  expect(result).toContain("**Status:** RESOLVED");
  expect(result).toContain("The port is submerged");
  expect(result).toContain("**Preparation:** Meet the captain");
  expect(result).toContain("**Outcome:** The ship sank");
  expect(result).toContain("Watch the horizon");
  expect(result).toContain("Outcome: A storm");
  expect(result).toContain("Old favor");
  expect(result).not.toMatch(/Old NPC|Lost secret|Removed scene/);
  expect(result.match(/^# The coast$/gm)).toHaveLength(1);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("empty campaign has a compass index and an honest empty state", () => {
  const result = renderCampaignModule({ ...snapshot, records: {} });
  expect(result).toContain("[Campaign compass](#campaign-compass)");
  expect(result).toContain("No available campaign material");
  expect(result).not.toContain("## Story and threads");
});

test("the existing reference keeps its default heading depth and complete sections", () => {
  const result = renderCampaignMarkdown(snapshot);
  expect(result).toContain("## NPCs\n");
  expect(result).toContain("### The captain\n");
  expect(result).toContain("## Secrets (GM only)");
});
