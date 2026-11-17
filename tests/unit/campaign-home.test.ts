import { expect, test } from "vitest";
import { compassExcerpt, recentActiveSessions } from "../../src/app/campaign-home-data";

const session = (id: string, updated = "2026-10-01", archivedAt: Date | null = null, deletedAt: Date | null = null) =>
  ({ id, updatedAt: new Date(updated), archivedAt, deletedAt });

test("empty, one and three active sessions retain their records without inventing progress", () => {
  expect(recentActiveSessions([])).toEqual([]);
  const one = session("one");
  expect(recentActiveSessions([one])).toEqual([one]);
  expect(recentActiveSessions([one])[0]).toBe(one);
  expect(recentActiveSessions([session("c"), session("a"), session("b")]).map(row => row.id)).toEqual(["a", "b", "c"]);
});

test("latest update wins, ties use ascending identity, and the original list is unchanged", () => {
  const original = [session("older", "2026-09-01"), session("b"), session("newest", "2026-11-01"), session("a")];
  const frozen = Object.freeze([...original]);
  expect(recentActiveSessions(frozen).map(row => row.id)).toEqual(["newest", "a", "b"]);
  expect(recentActiveSessions([...original].reverse())).toEqual(recentActiveSessions(original));
  expect(frozen).toEqual(original);
});

test("Archived and both kinds of Trash are excluded before limiting to three", () => {
  const stamp = new Date();
  expect(recentActiveSessions([session("archive", "2030-01-01", stamp), session("trash", "2030-01-01", null, stamp),
    session("both", "2030-01-01", stamp, stamp), session("kept")]).map(row => row.id)).toEqual(["kept"]);
  expect(recentActiveSessions([session("archive", "2030-01-01", stamp)])).toEqual([]);
});

test("Compass excerpt collapses whitespace only for display and keeps short text intact", () => {
  expect(compassExcerpt("  Una ciudad\n  y un secreto.  ")).toBe("Una ciudad y un secreto.");
  expect(compassExcerpt("   ")).toBe("");
  expect(compassExcerpt("<script>Idea del GM</script>")).toBe("<script>Idea del GM</script>");
});

test("Compass excerpt is bounded without splitting Unicode characters", () => {
  expect(compassExcerpt("a".repeat(240))).toBe("a".repeat(240));
  expect(compassExcerpt("🌍".repeat(241))).toBe(`${"🌍".repeat(240)}…`);
});
