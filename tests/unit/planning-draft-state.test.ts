import { expect, test } from "vitest";
import { capturePlanningValues, initialPlanningDraft, planningDraftReducer as reduce, putPlanningValues,
  samePlanningValues, type PlanningSnapshot } from "../../src/app/planning-draft-state";
const base: PlanningSnapshot = { revision: 2, unavailable: false,
  values: { name: "Guard", xp: "100", quantity: "1", kind: "ITEM", componentIds: ["a"], sessionId: "s" } };
const latest: PlanningSnapshot = { ...base, revision: 3, values: { ...base.values, name: "Remote guard", xp: "200" } };

test("captures all scalar/select values and checkbox groups, including unmounted selections", () => {
  expect(capturePlanningValues([{ name: "name", value: "  Local\nidea  " }, { name: "kind", value: "FAVOR" },
    { name: "componentIds", value: "b", checked: true }], base.values)).toEqual({
    ...base.values, name: "  Local\nidea  ", kind: "FAVOR", componentIds: ["a", "b"],
  });
  expect(capturePlanningValues([{ name: "componentIds", value: "a", checked: false }], base.values).componentIds).toEqual([]);
});
test("multipart sends exact local values and the base revision, never a newer hidden revision", () => {
  const data = new FormData(); data.set("expectedRevision", "99"); data.set("componentIds", "unwanted");
  putPlanningValues(data, base.values, 2);
  expect(data.get("expectedRevision")).toBe("2"); expect(data.getAll("componentIds")).toEqual(["a"]);
  expect(data.get("xp")).toBe("100");
});
test("CRLF and checkbox order compare equally without rewriting local content", () => {
  expect(samePlanningValues({ notes: "a\r\nb", componentIds: ["b", "a"] }, { notes: "a\nb", componentIds: ["a", "b"] })).toBe(true);
  expect(samePlanningValues({ kind: "ITEM" }, { kind: "FAVOR" })).toBe(false);
});
test("pending sections freeze every field and revision across siblings and errors", () => {
  const edited = reduce(initialPlanningDraft(base), { type: "edit", values: { ...base.values, name: "Local" } });
  expect(reduce(edited, { type: "sync", snapshot: latest })).toBe(edited);
  for (const conflict of [false, true]) {
    const failed = reduce(edited, { type: "failed", conflict, message: "Rejected" });
    expect(failed.values).toEqual(edited.values); expect(failed.base.revision).toBe(2);
    expect(reduce(failed, { type: "sync", snapshot: latest }).values.xp).toBe("100");
  }
});
test("consult does not merge, prepare retains untouched fields, discard is scoped", () => {
  let state = reduce(initialPlanningDraft(base), { type: "edit", values: { ...base.values, name: "Local" } });
  state = reduce(state, { type: "consulted", snapshot: latest });
  expect(state.base.revision).toBe(2); expect(state.values.xp).toBe("100");
  const prepared = reduce(state, { type: "prepare" });
  expect(prepared.base.revision).toBe(3); expect(prepared.values).toEqual(state.values);
  expect(prepared.message).toContain("without merging"); expect(prepared.dirty).toBe(true);
  expect(reduce(state, { type: "discard" }).values).toEqual(latest.values);
});
test("pristine and confirmed sections synchronize only at or beyond the confirmed revision", () => {
  expect(reduce(initialPlanningDraft(base), { type: "sync", snapshot: latest }).values).toEqual(latest.values);
  const saved = reduce(initialPlanningDraft(base), { type: "saved", revision: 4, message: "Saved" });
  expect(reduce(saved, { type: "sync", snapshot: latest })).toBe(saved);
  expect(reduce(saved, { type: "sync", snapshot: { ...latest, revision: 4 } }).confirmedRevision).toBeNull();
});
test("unavailable sections remain copyable but cannot be prepared", () => {
  const state = reduce(initialPlanningDraft(base), { type: "consulted", snapshot: { ...latest, unavailable: true } });
  expect(reduce(state, { type: "prepare" })).toBe(state); expect(state.values).toEqual(base.values);
});
test("status success does not mark pending text as saved", () => {
  const edited = reduce(initialPlanningDraft(base), { type: "edit", values: { ...base.values, name: "Local" } });
  const result = reduce(edited, { type: "saved", revision: 3, preserveDraft: true, message: "Status updated" });
  expect(result.dirty).toBe(true); expect(result.base.revision).toBe(2); expect(result.values.name).toBe("Local");
});
test("ambiguous or reused grant keys cannot be bypassed by editing, prepare or discard", () => {
  for (const failure of [{ uncertain: true }, { requestConflict: true }]) {
    let state = reduce(initialPlanningDraft(base), { type: "failed", message: "Unconfirmed", ...failure });
    state = reduce(state, { type: "consulted", snapshot: latest });
    expect(reduce(state, { type: "prepare" })).toBe(state); expect(reduce(state, { type: "discard" })).toBe(state);
    expect(reduce(state, { type: "edit", values: latest.values })).toBe(state);
    expect(reduce(state, { type: "sync", snapshot: latest })).toBe(state);
    expect(reduce(state, { type: "saved", revision: 3, message: "Confirmed" }).uncertain).toBe(false);
  }
});
