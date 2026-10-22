"use client";

import { useReducer, useRef, useState, type FormEvent } from "react";
import { readLocationAction, updateLocationAction } from "./location-actions";
import { initialLocationState, locationEditorReducer, type LocationSnapshot } from "./location-editor-state";
import { LocationStatus } from "./location-status";

export function LocationEditor({ location }: { location: LocationSnapshot }) {
  const [state, dispatch] = useReducer(locationEditorReducer, location, initialLocationState);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const name = useRef<HTMLInputElement>(null);
  const description = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || state.conflict) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    // Capture before disabling the fieldset, including the clicked intent.
    const form = new FormData(event.currentTarget, submitter);
    busy.current = true;
    setPending(true);
    dispatch({ type: "edit" });
    try {
      const result = await updateLocationAction(location.id, form);
      if (result.ok) dispatch({ type: "saved", location: result.location,
        message: form.get("intent") === "save" ? "Location saved."
          : "Location status updated. Name and description were not saved; local text remains only in this page." });
      else dispatch({ type: "failed", ...result });
    } catch {
      dispatch({ type: "failed", message: "Unable to confirm this request. Your draft is still here. Check the persisted version before retrying." });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function consult() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await readLocationAction(location.id);
      if (result.ok) dispatch({ type: "consulted", location: result.location });
      else dispatch({ type: "failed", ...result });
    } catch {
      dispatch({ type: "failed", message: "Unable to load the persisted version. Your draft is still here." });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function discard() {
    if (!state.latest) return;
    if (name.current) name.current.value = state.latest.name;
    if (description.current) description.current.value = state.latest.description ?? "";
    dispatch({ type: "discard" });
  }

  return <>
    <h1>{state.current.name}</h1>
    <p><LocationStatus location={state.current} /></p>
    {state.current.deletedAt && <p>Restore returns this location to {state.current.archivedAt ? "Archived" : "Active"}.</p>}
    {state.message && <p role={state.saved ? "status" : "alert"}>{state.message}</p>}
    {state.conflict && <p role="status">This location changed since you opened it. Your draft is preserved. Consult the persisted version before saving again.</p>}
    <form method="post" onSubmit={submit} onChange={() => dispatch({ type: "edit" })}>
      <input type="hidden" name="expectedRevision" value={state.current.revision} />
      <fieldset disabled={pending}>
        <legend>Location draft</legend>
        <label htmlFor="name">Name</label>
        <input ref={name} id="name" name="name" defaultValue={location.name} required readOnly={!!state.current.deletedAt} />
        <label htmlFor="description">Description</label>
        <textarea ref={description} id="description" name="description" defaultValue={location.description ?? ""} rows={8} readOnly={!!state.current.deletedAt} />
        <div className="actions">
          {!state.current.deletedAt && <button name="intent" value="save" disabled={state.conflict}>Save location</button>}
          {!state.current.deletedAt && !state.current.archivedAt && <button name="intent" value="archive" formNoValidate disabled={state.conflict}>Archive</button>}
          {!state.current.deletedAt && <button name="intent" value="trash" formNoValidate disabled={state.conflict}>Trash</button>}
          {state.current.deletedAt && <button name="intent" value="restore" formNoValidate disabled={state.conflict}>Restore</button>}
        </div>
      </fieldset>
    </form>
    <button type="button" disabled={pending} onClick={consult}>View persisted version</button>
    {pending && <p role="status">Request in progress…</p>}
    {state.latest && <section aria-labelledby="persisted-location-heading">
      <h2 id="persisted-location-heading">Persisted location · revision {state.latest.revision}</h2>
      <p>This is a snapshot. Consulting it does not save or replace your draft.</p>
      <p>Preparing your draft with this revision does not merge persisted changes into it.
        Compare both fields and incorporate any changes you want to keep manually.
        Save submits your draft&apos;s name and description and may replace newer content.</p>
      <dl>
        <dt>Name</dt><dd>{state.latest.name}</dd>
        <dt>Description</dt><dd className="preserve-lines">{state.latest.description ?? "(empty)"}</dd>
        <dt>Status</dt><dd><LocationStatus location={state.latest} /></dd>
      </dl>
      {state.latest.deletedAt && <p>This location is in trash. You can copy your draft before loading the persisted version to restore it.</p>}
      <div className="actions">
        <button type="button" disabled={pending || !!state.latest.deletedAt}
          onClick={() => dispatch({ type: "prepare" })}>Keep draft and use this revision</button>
        <button type="button" disabled={pending} onClick={discard}>Use persisted version (discard draft)</button>
      </div>
    </section>}
  </>;
}
