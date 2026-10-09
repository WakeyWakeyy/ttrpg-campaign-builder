import { expect, test } from "vitest";
import { findTimelineContinuityIssues } from "../../src/modules/intelligence/timeline-continuity";

const event = (id: string, date: string | null, world: string | null, archivedAt: Date | null = null,
  deletedAt: Date | null = null) => ({ id, title: id, occurredAt: date ? new Date(`${date}T00:00:00Z`) : null,
  inWorldDate: world, archivedAt, deletedAt });
const link = (eventId: string, targetEntityId: string | null) =>
  ({ eventId, targetEntityId, targetNameSnapshot: "Old Lighthouse" });

test("prompts for distinct real dates on the same in-world date and entity", () => {
  const findings = findTimelineContinuityIssues([
    event("a", "2026-01-01", "Day 3"), event("b", "2026-01-02", " day 3 "),
    event("c", "2026-01-01", "Day 3"),
  ], [link("a", "place"), link("b", "place"), link("c", "other")]);
  expect(findings).toEqual([{ firstId: "a", firstTitle: "a", secondId: "b", secondTitle: "b",
    entityName: "Old Lighthouse", inWorldDate: "Day 3" }]);
});

test("ignores unavailable, unlinked, and undated events", () => {
  const gone = new Date();
  expect(findTimelineContinuityIssues([
    event("a", "2026-01-01", "Day 3"), event("b", "2026-01-02", "Day 3", gone),
    event("c", "2026-01-02", "Day 3", null, gone), event("d", null, "Day 3"),
    event("e", "2026-01-02", null), event("f", "2026-01-02", "Day 3"),
  ], [link("a", "place"), link("b", "place"), link("c", "place"), link("d", "place"),
    link("e", "place"), link("f", null)])).toEqual([]);
});
