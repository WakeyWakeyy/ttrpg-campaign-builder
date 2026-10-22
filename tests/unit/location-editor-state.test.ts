import { expect, test } from "vitest";
import { initialLocationState, locationEditorReducer, type LocationSnapshot } from "../../src/app/location-editor-state";

const original: LocationSnapshot = { id: "location", name: "Harbor", description: "Original",
  revision: 1, archivedAt: null, deletedAt: null };
const newer = { ...original, name: "New harbor", description: "Newer accepted idea", revision: 2 };

test("validation failure and consultation never advance the draft's base revision", () => {
  const failed = locationEditorReducer(initialLocationState(original), { type: "failed", message: "Invalid name" });
  const consulted = locationEditorReducer(failed, { type: "consulted", location: newer });
  expect(consulted.current).toEqual(original);
  expect(consulted.latest).toEqual(newer);
  expect(consulted.saved).toBe(false);
});

test("editing and consulting after conflict do not unblock stale submission", () => {
  const conflict = locationEditorReducer(initialLocationState(original), { type: "failed", message: "Conflict", conflict: true });
  const edited = locationEditorReducer(conflict, { type: "edit" });
  const consulted = locationEditorReducer(edited, { type: "consulted", location: newer });
  expect(consulted.conflict).toBe(true);
  expect(consulted.current.revision).toBe(1);
  expect(consulted.saved).toBe(false);
});

test("explicit preparation adopts only the consulted revision and never reports a save", () => {
  const consulted = locationEditorReducer(initialLocationState(original), { type: "consulted", location: newer });
  const prepared = locationEditorReducer(consulted, { type: "prepare" });
  expect(prepared.current).toEqual(newer);
  expect(prepared.conflict).toBe(false);
  expect(prepared.saved).toBe(false);
  expect(prepared.latest).toBeNull();
  expect(prepared.message).toContain("then save");
  const raced = locationEditorReducer(prepared, { type: "failed", message: "Changed again", conflict: true });
  expect(raced.current.revision).toBe(2);
  expect(raced.conflict).toBe(true);
});

test("failed consultation removes any previous recovery candidate but preserves the conflict", () => {
  const conflict = locationEditorReducer(initialLocationState(original), { type: "failed", message: "Conflict", conflict: true });
  const consulted = locationEditorReducer(conflict, { type: "consulted", location: newer });
  const failed = locationEditorReducer(consulted, { type: "failed", message: "Unavailable" });
  expect(failed.latest).toBeNull();
  expect(failed.conflict).toBe(true);
  expect(failed.current).toEqual(original);
});

test("trashed snapshots require explicit discard rather than preparation for editing", () => {
  const trashed = { ...newer, deletedAt: new Date(), revision: 3 };
  const consulted = locationEditorReducer(initialLocationState(original), { type: "consulted", location: trashed });
  expect(locationEditorReducer(consulted, { type: "prepare" })).toEqual(consulted);
  const discarded = locationEditorReducer(consulted, { type: "discard" });
  expect(discarded.current).toEqual(trashed);
  expect(discarded.saved).toBe(false);
});

test("only confirmed save reports success, and subsequent input clears that feedback", () => {
  const saved = locationEditorReducer(initialLocationState(original), { type: "saved", location: newer, message: "Location saved." });
  expect(saved.saved).toBe(true);
  expect(saved.current.revision).toBe(2);
  expect(locationEditorReducer(saved, { type: "edit" })).toMatchObject({ saved: false, message: "" });
});
