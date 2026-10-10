import { expect, test } from "vitest";
import { findClueContinuityIssues } from "../../src/modules/intelligence/clue-continuity";

const clue = (id: string, discoveryLocationId: string | null, archivedAt: Date | null = null,
  deletedAt: Date | null = null) => ({ id, title: id, discoveryLocationId, archivedAt, deletedAt });
const location = (id: string, archivedAt: Date | null = null, deletedAt: Date | null = null) =>
  ({ id, name: id, archivedAt, deletedAt });

test("reviews clues without a recorded route or whose location is unavailable", () => {
  const gone = new Date();
  expect(findClueContinuityIssues([
    clue("unplaced", null), clue("lost", "archived"), clue("discarded", "trashed"),
    clue("reachable", "available"), clue("old-clue", null, gone), clue("trashed-clue", null, null, gone),
  ], [location("archived", gone), location("trashed", null, gone), location("available")])).toEqual([
    { clueId: "unplaced", clueTitle: "unplaced", reason: "NO_ROUTE" },
    { clueId: "lost", clueTitle: "lost", reason: "LOCATION_UNAVAILABLE", locationName: "archived" },
    { clueId: "discarded", clueTitle: "discarded", reason: "LOCATION_UNAVAILABLE", locationName: "trashed" },
  ]);
});
