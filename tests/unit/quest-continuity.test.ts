import { expect, test } from "vitest";
import { findQuestContinuityIssues } from "../../src/modules/intelligence/quest-continuity";

const quest = (id: string, status: "OPEN" | "POSTPONED" | "RESOLVED" | "FAILED" | "ABANDONED",
  parentQuestId: string | null = null, archivedAt: Date | null = null, deletedAt: Date | null = null) =>
  ({ id, name: id, status, parentQuestId, archivedAt, deletedAt });

test("flags available open children of closed threads without treating the state as an error", () => {
  const findings = findQuestContinuityIssues([
    quest("resolved", "RESOLVED"), quest("open", "OPEN", "resolved"),
    quest("failed", "FAILED"), quest("paused", "POSTPONED", "failed"),
    quest("abandoned", "ABANDONED"), quest("still-open", "OPEN", "abandoned"),
    quest("ongoing", "OPEN"), quest("normal", "OPEN", "ongoing"),
  ]);
  expect(findings.map(finding => finding.questId)).toEqual(["open", "paused", "still-open"]);
});

test("excludes archived, trashed and already closed threads", () => {
  const date = new Date();
  expect(findQuestContinuityIssues([
    quest("closed", "RESOLVED"), quest("done", "RESOLVED", "closed"),
    quest("archived", "OPEN", "closed", date), quest("trashed", "OPEN", "closed", null, date),
    quest("old-parent", "RESOLVED", null, date), quest("active", "OPEN", "old-parent"),
  ])).toEqual([]);
});
