export type LocationSnapshot = {
  id: string;
  name: string;
  description: string | null;
  revision: number;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

export type LocationResult =
  | { ok: true; location: LocationSnapshot }
  | { ok: false; message: string; conflict?: boolean };

export type LocationEditorState = {
  current: LocationSnapshot;
  latest: LocationSnapshot | null;
  conflict: boolean;
  message: string;
  saved: boolean;
};

export function initialLocationState(current: LocationSnapshot): LocationEditorState {
  return { current, latest: null, conflict: false, message: "", saved: false };
}

type Event =
  | { type: "edit" }
  | { type: "failed"; message: string; conflict?: boolean }
  | { type: "saved"; location: LocationSnapshot; message: string }
  | { type: "consulted"; location: LocationSnapshot }
  | { type: "prepare" }
  | { type: "discard" };

// Values stay in the native form. Reading a newer revision never adopts it;
// only an explicit recovery decision can change the revision used by Save.
export function locationEditorReducer(state: LocationEditorState, event: Event): LocationEditorState {
  switch (event.type) {
    case "edit": return { ...state, message: "", saved: false };
    case "failed": return { ...state, message: event.message, saved: false,
      conflict: state.conflict || !!event.conflict, latest: null };
    case "saved": return { ...initialLocationState(event.location), message: event.message, saved: true };
    case "consulted": return { ...state, latest: event.location, message: "", saved: false };
    case "prepare":
      if (!state.latest || state.latest.deletedAt) return state;
      return { ...initialLocationState(state.latest),
        message: "Draft retained without merging persisted changes. Review both fields before saving; Save submits your draft's name and description and may replace newer content." };
    case "discard":
      if (!state.latest) return state;
      return { ...initialLocationState(state.latest), message: "Persisted version loaded. Local draft discarded." };
  }
}
