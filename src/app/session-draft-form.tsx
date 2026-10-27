"use client";

import { createContext, useContext, useLayoutEffect, useReducer, useRef, useState,
  type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "./action-state";
import { readSessionDraftAction } from "./session-draft-actions";
import { initialSessionDraft, sessionDraftReducer, type SessionDraftSnapshot, type SessionDraftTarget } from "./session-draft-state";

const SubmitDisabled = createContext(false);
const fieldLabels: Record<string, string> = { title: "Title", plannedFor: "Planned date", preparation: "Preparation", outcome: "Outcome", position: "Order" };
export function SessionDraftSubmit(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const disabled = useContext(SubmitDisabled);
  return <button {...props} disabled={disabled || props.disabled} />;
}

export function SessionDraftForm({ sessionId, target, snapshot, action, children }: {
  sessionId: string;
  target: SessionDraftTarget;
  snapshot: SessionDraftSnapshot;
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(sessionDraftReducer, snapshot, initialSessionDraft);
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const draftValues = useRef(snapshot.values);
  const busy = useRef(false);
  const stale = state.conflict || state.dirty && snapshot.revision > state.base.revision;
  const waiting = state.confirmedRevision !== null && snapshot.revision < state.confirmedRevision;

  function applyValues(values: Record<string, string>) {
    for (const [key, value] of Object.entries(values)) {
      const control = form.current?.elements.namedItem(key);
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) control.value = value;
    }
  }

  useLayoutEffect(() => {
    // React may update defaultValue on an untouched field inside a dirty form.
    // Restore the entire local section before paint, not only the typed field.
    if (pending || state.dirty || state.conflict || waiting) {
      applyValues(draftValues.current);
      return;
    }
    if (snapshot.revision > state.base.revision || state.confirmedRevision !== null) {
      draftValues.current = snapshot.values;
      applyValues(snapshot.values);
      dispatch({ type: "sync", snapshot });
    }
  }, [snapshot, state.base.revision, state.dirty, state.conflict, state.confirmedRevision, pending, waiting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || stale || waiting) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    busy.current = true;
    setPending(true);
    try {
      const result = await action({ message: "" }, data);
      if (result.success) dispatch({ type: "saved", ...result.success, message: result.message });
      else dispatch({ type: "failed", ...result, message: result.conflict
        ? "Session changed. This draft is retained. Consult persisted values before saving again." : result.message });
    } catch {
      dispatch({ type: "failed", message: "Unable to confirm this request. Your draft is retained. Consult persisted values before retrying." });
    } finally { busy.current = false; setPending(false); }
  }

  async function consult() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await readSessionDraftAction(sessionId, target);
      if (result.ok) dispatch({ type: "consulted", snapshot: result.snapshot });
      else dispatch({ type: "failed", message: result.message });
    } catch {
      dispatch({ type: "failed", message: "Unable to load persisted values. Your draft is retained." });
    } finally { busy.current = false; setPending(false); }
  }

  return <div>
    {state.message && <p role={state.error ? "alert" : "status"}>{state.message}</p>}
    {stale && <p role="status">Session changed. This section&apos;s draft is retained at revision {state.base.revision}.
      Consult persisted values before saving again.</p>}
    <form ref={form} method="post" onSubmit={submit} onChange={event => {
      const data = new FormData(event.currentTarget);
      const values = Object.fromEntries(Object.keys(state.base.values).map(key => [key, String(data.get(key) ?? "")]));
      draftValues.current = values;
      dispatch({ type: "edit", values });
    }}>
      <input type="hidden" name="expectedRevision" value={state.base.revision} />
      <SubmitDisabled.Provider value={pending || stale || waiting}>
        <fieldset disabled={pending || waiting}>{children}</fieldset>
      </SubmitDisabled.Provider>
    </form>
    {state.dirty && <p>Unsaved changes in this section.</p>}
    {(pending || waiting) && <p role="status">Request in progress…</p>}
    <button type="button" disabled={pending || waiting} onClick={consult}>View persisted values for this section</button>
    {state.latest && <section aria-label="Persisted section values">
      <h3>Persisted section · revision {state.latest.revision}</h3>
      <p>Preparing a revision does not merge changes. Compare every field and incorporate wanted changes manually before Save.</p>
      <dl>{Object.entries(state.latest.values).map(([key, value]) => <div key={key}>
        <dt>{fieldLabels[key]}</dt><dd className="preserve-lines">{value || "(empty)"}</dd>
      </div>)}</dl>
      {state.latest.unavailable && <p>This section is in trash. The draft remains available to copy; restore it before editing.</p>}
      <button type="button" disabled={pending || state.latest.unavailable}
        onClick={() => dispatch({ type: "prepare" })}>Keep this draft and use this revision</button>
      <button type="button" disabled={pending} onClick={() => {
        draftValues.current = state.latest!.values;
        applyValues(state.latest!.values);
        dispatch({ type: "discard" });
        router.refresh();
      }}>Load persisted values (discard this draft)</button>
    </section>}
  </div>;
}
