import { expect, test } from "vitest";
import { reviewThreads } from "../../src/modules/intelligence/thread-review";

const quest = (id: string, status: string, parentQuestId: string | null = null,
  archivedAt: Date | null = null, deletedAt: Date | null = null) =>
  ({ id, name: id, status, parentQuestId, archivedAt, deletedAt });

test("groups available unresolved and abandoned threads with available parent context", () => {
  const review = reviewThreads([
    quest("parent", "RESOLVED"), quest("z-open", "OPEN", "parent"),
    quest("a-open", "OPEN"), quest("later", "POSTPONED"), quest("left", "ABANDONED"),
    quest("done", "FAILED"),
  ]);
  expect(review).toEqual({
    open: [{ id: "a-open", name: "a-open", parentName: null },
      { id: "z-open", name: "z-open", parentName: "parent" }],
    postponed: [{ id: "later", name: "later", parentName: null }],
    abandoned: [{ id: "left", name: "left", parentName: null }],
  });
});

test("hides archived and trashed threads and does not expose an unavailable parent", () => {
  const date = new Date();
  expect(reviewThreads([
    quest("hidden-parent", "OPEN", null, date), quest("child", "OPEN", "hidden-parent"),
    quest("archived", "POSTPONED", null, date), quest("trashed", "ABANDONED", null, null, date),
  ])).toEqual({ open: [{ id: "child", name: "child", parentName: null }], postponed: [], abandoned: [] });
});
