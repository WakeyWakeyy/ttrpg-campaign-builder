import { expect, test } from "vitest";
import { initialSessionDraft, sameSessionDraft, sessionDraftReducer, sessionDraftSnapshot } from "../../src/app/session-draft-state";

const source = { title: "Session", preparation: "Plan", outcome: "Result", plannedFor: "2026-10-22", deletedAt: null };
const base = sessionDraftSnapshot(2, "session", source);
const newer = sessionDraftSnapshot(3, "session", { ...source, title: "Remote title" });

test("dirty sibling refresh cannot replace values or adopt the aggregate revision", () => {
  const dirty = sessionDraftReducer(initialSessionDraft(base), { type: "edit", values: { ...base.values, preparation: "Local plan" } });
  expect(sessionDraftReducer(dirty, { type: "sync", snapshot: newer })).toEqual(dirty);
  const consulted = sessionDraftReducer(dirty, { type: "consulted", snapshot: newer });
  expect(consulted.base).toEqual(base);
  const prepared = sessionDraftReducer(consulted, { type: "prepare" });
  expect(prepared.base).toEqual(newer);
  expect(prepared.dirty).toBe(true);
  expect(prepared.message).toContain("without merging");
  expect(prepared.confirmedRevision).toBeNull();
});

test("clean sections synchronize, but confirmed saves wait for their server revision", () => {
  const clean = initialSessionDraft(base);
  expect(sessionDraftReducer(clean, { type: "sync", snapshot: newer }).base).toEqual(newer);
  const accepted = sessionDraftReducer(clean, { type: "saved", revision: 3, message: "Saved" });
  expect(sessionDraftReducer(accepted, { type: "sync", snapshot: base })).toEqual(accepted);
  expect(sessionDraftReducer(accepted, { type: "sync", snapshot: newer })).toMatchObject({ base: newer, confirmedRevision: null });
});

test("conflicts and failed reads retain the original base until an explicit decision", () => {
  const failed = sessionDraftReducer(initialSessionDraft(base), { type: "failed", message: "Conflict", conflict: true });
  expect(sessionDraftReducer(failed, { type: "sync", snapshot: newer })).toEqual(failed);
  const consulted = sessionDraftReducer(failed, { type: "consulted", snapshot: newer });
  const readFailed = sessionDraftReducer(consulted, { type: "failed", message: "Read failed" });
  expect(readFailed).toMatchObject({ conflict: true, base, latest: null });
});

test("discard is scoped to the consulted section and cannot move backwards on an old render", () => {
  const consulted = sessionDraftReducer(initialSessionDraft(base), { type: "consulted", snapshot: newer });
  const discarded = sessionDraftReducer(consulted, { type: "discard" });
  expect(discarded).toMatchObject({ base: newer, dirty: false });
  expect(sessionDraftReducer(discarded, { type: "sync", snapshot: base })).toEqual(discarded);
});

test("lifecycle success does not mark pending content as saved", () => {
  const dirty = sessionDraftReducer(initialSessionDraft(base), { type: "edit", values: { ...base.values, preparation: "Pending" } });
  const status = sessionDraftReducer(dirty, { type: "saved", revision: 3, message: "Status changed", preserveDraft: true });
  expect(status).toMatchObject({ dirty: true, base, confirmedRevision: null });
  expect(sessionDraftReducer(status, { type: "sync", snapshot: newer })).toEqual(status);
});

test("unavailable sections remain recoverable to copy or discard, not to reapply", () => {
  const latest = { ...newer, unavailable: true };
  const consulted = sessionDraftReducer(initialSessionDraft(base), { type: "consulted", snapshot: latest });
  expect(sessionDraftReducer(consulted, { type: "prepare" })).toEqual(consulted);
  expect(sessionDraftReducer(consulted, { type: "discard" }).base).toEqual(latest);
});

test("outcome snapshots never include preparation and new scene snapshots stay empty", () => {
  expect(sessionDraftSnapshot(2, "session-outcome", source).values).toEqual({ outcome: "Result" });
  expect(sessionDraftSnapshot(2, "scene-outcome", source).values).toEqual({ outcome: "Result" });
  expect(sessionDraftSnapshot(2, "new-scene", source).values).toEqual({ title: "", preparation: "" });
  expect(sessionDraftSnapshot(2, "scene", { ...source, position: 1 }, true).unavailable).toBe(true);
});

test("line ending comparison preserves content and whitespace without treating CRLF as a new edit", () => {
  expect(sameSessionDraft({ outcome: "  Plan\r\n" }, { outcome: "  Plan\n" })).toBe(true);
  expect(sameSessionDraft({ outcome: "  Plan\n" }, { outcome: "Plan\n" })).toBe(false);
});
