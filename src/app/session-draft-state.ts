// Scoped to the text editors on Session and Recap, not a global draft store.
export type SessionDraftTarget =
  | { kind: "session" | "session-outcome" | "new-scene" }
  | { kind: "scene" | "scene-outcome"; sceneId: string };
export type SessionDraftSnapshot = {
  revision: number;
  values: Record<string, string>;
  unavailable: boolean;
};
type Source = { title: string; preparation: string | null; outcome: string | null;
  deletedAt: Date | null; plannedFor?: string | null; position?: number };

export function sessionDraftSnapshot(revision: number, kind: SessionDraftTarget["kind"], source: Source,
  parentDeleted = false): SessionDraftSnapshot {
  const values: Record<string, string> = kind === "new-scene" ? { title: "", preparation: "" }
    : kind === "session-outcome" || kind === "scene-outcome" ? { outcome: source.outcome ?? "" }
    : kind === "session" ? { title: source.title, plannedFor: source.plannedFor ?? "",
      preparation: source.preparation ?? "", outcome: source.outcome ?? "" }
    : { position: String(source.position), title: source.title,
      preparation: source.preparation ?? "", outcome: source.outcome ?? "" };
  return { revision, values, unavailable: parentDeleted || !!source.deletedAt };
}

// DOM textareas use LF; native multipart submissions can use CRLF.
export function sameSessionDraft(a: Record<string, string>, b: Record<string, string>) {
  return Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(key => a[key].replaceAll("\r\n", "\n") === b[key]?.replaceAll("\r\n", "\n"));
}

export type SessionDraftState = {
  base: SessionDraftSnapshot;
  dirty: boolean;
  conflict: boolean;
  latest: SessionDraftSnapshot | null;
  confirmedRevision: number | null;
  message: string;
  error: boolean;
};
export function initialSessionDraft(base: SessionDraftSnapshot): SessionDraftState {
  return { base, dirty: false, conflict: false, latest: null, confirmedRevision: null, message: "", error: false };
}
type Event =
  | { type: "edit"; values: Record<string, string> }
  | { type: "sync"; snapshot: SessionDraftSnapshot }
  | { type: "saved"; revision: number; message: string; preserveDraft?: boolean }
  | { type: "failed"; message: string; conflict?: boolean }
  | { type: "consulted"; snapshot: SessionDraftSnapshot }
  | { type: "prepare" }
  | { type: "discard" };

export function sessionDraftReducer(state: SessionDraftState, event: Event): SessionDraftState {
  switch (event.type) {
    case "edit": return { ...state, dirty: !sameSessionDraft(state.base.values, event.values), message: "", error: false };
    case "sync":
      if (state.dirty || state.conflict || event.snapshot.revision < (state.confirmedRevision ?? state.base.revision)) return state;
      return { ...state, base: event.snapshot, confirmedRevision: null };
    case "saved": return { ...state, dirty: event.preserveDraft ? state.dirty : false, conflict: false, latest: null,
      confirmedRevision: event.preserveDraft && state.dirty ? null : event.revision, message: event.message, error: false };
    case "failed": return { ...state, message: event.message, error: true,
      conflict: state.conflict || !!event.conflict, latest: null };
    case "consulted": return { ...state, latest: event.snapshot, message: "", error: false };
    case "prepare":
      if (!state.latest || state.latest.unavailable) return state;
      return { ...initialSessionDraft(state.latest), dirty: true,
        message: "Draft retained without merging persisted changes. Review every field before Save; saving can replace newer content in this section." };
    case "discard":
      if (!state.latest) return state;
      return { ...initialSessionDraft(state.latest), message: "Persisted values loaded. Only this section's draft was discarded." };
  }
}
