import { expect, test } from "vitest";
import { summarizeSessionOutcomes } from "../../src/modules/intelligence/session-summary";

const session = (id: string, outcome: string | null, archivedAt: Date | null = null, deletedAt: Date | null = null) =>
  ({ id, title: id, plannedFor: null, outcome, archivedAt, deletedAt });
const scene = (id: string, sessionId: string, outcome: string | null, deletedAt: Date | null = null) =>
  ({ id, sessionId, title: id, outcome, deletedAt });

test("shows recorded outcomes with stable source IDs and leaves preparation out", () => {
  expect(summarizeSessionOutcomes([session("one", "  The gate opened  "), session("two", null)],
    [scene("a", "one", "  A friend arrived "), scene("b", "two", "The party fled")])).toEqual([
    { sessionId: "one", title: "one", plannedFor: null, outcome: "The gate opened",
      scenes: [{ id: "a", title: "a", outcome: "A friend arrived" }] },
    { sessionId: "two", title: "two", plannedFor: null, outcome: null,
      scenes: [{ id: "b", title: "b", outcome: "The party fled" }] },
  ]);
});

test("omits unavailable records and sessions without an outcome", () => {
  const date = new Date();
  expect(summarizeSessionOutcomes([session("empty", " "), session("archived", "old", date),
    session("trashed", "old", null, date), session("active", null)],
  [scene("lost", "active", "old", date), scene("old", "archived", "old")])).toEqual([]);
});
