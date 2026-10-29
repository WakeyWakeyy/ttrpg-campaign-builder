// Only the Encounter/Reward planning editors and Blueprint proposal review use
// this state. Session and Location keep their existing, independent contracts.
import type { ActionState } from "./action-state";

export type PlanningValues = Record<string, string | string[]>;
export type PlanningSnapshot = { revision: number; values: PlanningValues; unavailable: boolean };
export type PlanningActionState = ActionState & { requestConflict?: boolean };
export type PlanningRead = { ok: true; snapshot: PlanningSnapshot } | { ok: false; message: string };

type Field = { name: string; value: string; type?: string; checked?: boolean };
export function capturePlanningValues(fields: Iterable<Field>, previous: PlanningValues): PlanningValues {
  const controls = [...fields];
  return Object.fromEntries(Object.entries(previous).map(([name, old]) => {
    const matches = controls.filter(field => field.name === name);
    if (Array.isArray(old)) {
      // Keep selections whose controls disappeared after a related save. Never
      // silently submit a smaller grant when a component was removed/purged.
      const retained = old.filter(value => !matches.some(field => field.value === value));
      return [name, [...retained, ...matches.filter(field => field.checked).map(field => field.value)]];
    }
    return [name, matches[0]?.value ?? old];
  }));
}
export function samePlanningValues(a: PlanningValues, b: PlanningValues) {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => {
    const left = a[key], right = b[key];
    return Array.isArray(left) && Array.isArray(right)
      ? JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
      : typeof left === "string" && typeof right === "string"
        && left.replaceAll("\r\n", "\n") === right.replaceAll("\r\n", "\n");
  });
}
export function putPlanningValues(data: FormData, values: PlanningValues, revision: number) {
  for (const [name, value] of Object.entries(values)) {
    data.delete(name);
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  data.set("expectedRevision", String(revision));
}

export function initialPlanningDraft(base: PlanningSnapshot) {
  return { base, values: base.values, dirty: false, conflict: false,
    latest: null as PlanningSnapshot | null, confirmedRevision: null as number | null,
    message: "", error: false, uncertain: false, requestConflict: false };
}
export type PlanningDraftState = ReturnType<typeof initialPlanningDraft>;
type Event =
  | { type: "edit"; values: PlanningValues }
  | { type: "sync"; snapshot: PlanningSnapshot }
  | { type: "saved"; revision: number; message: string; preserveDraft?: boolean }
  | { type: "failed"; message: string; conflict?: boolean; uncertain?: boolean; requestConflict?: boolean }
  | { type: "consulted"; snapshot: PlanningSnapshot }
  | { type: "prepare" } | { type: "discard" };
export function planningDraftReducer(state: PlanningDraftState, event: Event): PlanningDraftState {
  switch (event.type) {
    case "edit":
      if (state.uncertain || state.requestConflict) return state;
      return { ...state, values: event.values, dirty: !samePlanningValues(state.base.values, event.values), message: "", error: false };
    case "sync":
      if (state.dirty || state.conflict || state.uncertain || state.requestConflict
        || event.snapshot.revision < (state.confirmedRevision ?? state.base.revision)) return state;
      return { ...state, base: event.snapshot, values: event.snapshot.values, confirmedRevision: null };
    case "saved": return { ...state, dirty: event.preserveDraft ? state.dirty : false, conflict: false,
      latest: null, uncertain: false, requestConflict: false,
      confirmedRevision: event.preserveDraft && state.dirty ? null : event.revision, message: event.message, error: false };
    case "failed": return { ...state, message: event.message, error: true, latest: null,
      conflict: state.conflict || !!event.conflict, uncertain: state.uncertain || !!event.uncertain,
      requestConflict: state.requestConflict || !!event.requestConflict };
    case "consulted": return { ...state, latest: event.snapshot, message: "", error: false };
    case "prepare":
      if (!state.latest || state.latest.unavailable || state.uncertain || state.requestConflict) return state;
      return { ...initialPlanningDraft(state.latest), values: state.values, dirty: true,
        message: "Draft retained without merging persisted changes. Review every field before Save; saving can replace newer content in this section." };
    case "discard":
      if (!state.latest || state.uncertain || state.requestConflict) return state;
      return { ...initialPlanningDraft(state.latest), message: "Persisted values loaded. Only this section's draft was discarded." };
  }
}
