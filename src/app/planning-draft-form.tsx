"use client";

import { createContext, useContext, useLayoutEffect, useReducer, useRef, useState,
  type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import { capturePlanningValues, initialPlanningDraft, planningDraftReducer, putPlanningValues,
  type PlanningActionState, type PlanningRead, type PlanningSnapshot } from "./planning-draft-state";

const SubmitDisabled = createContext(false);
export function PlanningSubmit(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const disabled = useContext(SubmitDisabled);
  return <button {...props} disabled={disabled || props.disabled} />;
}
const labels: Record<string, string> = { title: "Title", notes: "Notes", partyLevel: "Party level", partySize: "Number of characters",
  name: "Name", xp: "XP per creature", quantity: "Quantity", kind: "Kind", description: "Description",
  recipient: "Given to", sessionId: "Session", componentIds: "Selected component IDs", decision: "Decision" };

export function PlanningDraftForm({ snapshot, action, read, requestKey, children }: {
  snapshot: PlanningSnapshot;
  action: (state: PlanningActionState, data: FormData) => Promise<PlanningActionState>;
  read: () => Promise<PlanningRead>;
  requestKey?: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(planningDraftReducer, snapshot, initialPlanningDraft);
  const [pending, setPending] = useState(false);
  const [grantKey, setGrantKey] = useState(requestKey);
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const submitted = useRef<FormData | null>(null);
  const stale = state.conflict || state.dirty && snapshot.revision > state.base.revision;
  const waiting = state.confirmedRevision !== null && snapshot.revision < state.confirmedRevision;
  const locked = state.uncertain || state.requestConflict;

  useLayoutEffect(() => {
    if (!pending && !state.dirty && !state.conflict && !locked && !waiting
      && (snapshot.revision > state.base.revision || state.confirmedRevision !== null)) {
      dispatch({ type: "sync", snapshot });
      return;
    }
    // Preserve the whole section, including untouched values, select options and
    // checkbox groups. RSC may change defaultValue even without remounting it.
    for (const control of Array.from(form.current?.elements ?? [])) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
      const value = state.values[control.name];
      if (value === undefined) continue;
      if (Array.isArray(value) && control instanceof HTMLInputElement) control.checked = value.includes(control.value);
      else if (typeof value === "string") {
        if (control instanceof HTMLSelectElement && !Array.from(control.options).some(option => option.value === value)) {
          control.add(new Option(`Unavailable selection: ${value}`, value));
        }
        control.value = value;
      }
    }
  }, [snapshot, state, pending, locked, waiting]);

  async function send(data: FormData) {
    busy.current = true;
    setPending(true);
    submitted.current = data;
    try {
      const result = await action({ message: "" }, data);
      if (result.success) {
        dispatch({ type: "saved", ...result.success, message: result.message });
        // A new key is issued only after the previous grant is confirmed.
        if (grantKey) setGrantKey(crypto.randomUUID());
      } else dispatch({ type: "failed", ...result, message: result.conflict && !result.requestConflict
        ? "This section changed. Your draft is retained. Consult persisted values before saving again." : result.message });
    } catch {
      dispatch({ type: "failed", uncertain: !!grantKey,
        message: "Unable to confirm this request. Your draft is retained. Consult persisted values before retrying." });
    } finally { busy.current = false; setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || stale || waiting || locked) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    putPlanningValues(data, state.values, state.base.revision);
    if (grantKey) data.set("requestKey", grantKey);
    await send(data);
  }
  async function consult() {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const result = await read();
      if (result.ok) dispatch({ type: "consulted", snapshot: result.snapshot });
      else dispatch({ type: "failed", message: result.message });
    } catch { dispatch({ type: "failed", message: "Unable to load persisted values. Your draft is retained." }); }
    finally { busy.current = false; setPending(false); }
  }

  return <div>
    {state.message && <p role={state.error ? "alert" : "status"}>{state.message}</p>}
    {stale && <p role="status">This section&apos;s draft is retained at revision {state.base.revision}. Consult persisted values before saving again.</p>}
    <form ref={form} method="post" onSubmit={submit} onChange={event => {
      const fields = Array.from(event.currentTarget.elements).filter(control => control instanceof HTMLInputElement
        || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];
      dispatch({ type: "edit", values: capturePlanningValues(fields.map(control => ({ name: control.name,
        value: control.value, checked: control instanceof HTMLInputElement && control.checked })), state.values) });
    }}>
      <input type="hidden" name="expectedRevision" value={state.base.revision} />
      {grantKey && <input type="hidden" name="requestKey" value={grantKey} />}
      <SubmitDisabled.Provider value={pending || stale || waiting || locked}>
        <fieldset disabled={pending || waiting || locked}>{children}</fieldset>
      </SubmitDisabled.Provider>
    </form>
    {state.dirty && <p>Unsaved changes in this section.</p>}
    {(pending || waiting) && <p role="status">Request in progress…</p>}
    {locked && <p>Grant values and request key are retained. Check the grant ledger. An unconfirmed request can only be retried with the same details and key.</p>}
    {state.uncertain && <button type="button" disabled={pending} onClick={() => {
      if (!busy.current && submitted.current) void send(submitted.current);
    }}>Retry the same grant request</button>}
    <button type="button" disabled={pending || waiting} onClick={consult}>View persisted values for this section</button>
    {state.latest && <section aria-label="Persisted section values">
      <h3>Persisted section · revision {state.latest.revision}</h3>
      <p>Preparing a revision does not merge changes. Compare every field and incorporate wanted changes manually before Save.</p>
      <dl>{Object.entries(state.latest.values).map(([key, value]) => <div key={key}>
        <dt>{labels[key] ?? key}</dt><dd className="preserve-lines">{(Array.isArray(value) ? value.join(", ") : value) || "(empty)"}</dd>
      </div>)}</dl>
      {state.latest.unavailable && <p>This section is unavailable for editing. The draft remains available to copy.</p>}
      <button type="button" disabled={pending || state.latest.unavailable || locked}
        onClick={() => dispatch({ type: "prepare" })}>Keep this draft and use this revision</button>
      <button type="button" disabled={pending || locked}
        onClick={() => dispatch({ type: "discard" })}>Load persisted values (discard this draft)</button>
    </section>}
  </div>;
}
