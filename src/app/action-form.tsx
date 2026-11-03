"use client";

import { useActionState, useLayoutEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "./action-state";
import { useConfirmDeparture, usePendingForm } from "./unsaved-navigation";
import { readNativeValues } from "./unsaved-navigation-state";

export function ActionForm({ action, children, reloadLabel = "Reload location", protectUnsaved = false, leavesEditor = false }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  reloadLabel?: string;
  protectUnsaved?: boolean;
  leavesEditor?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  const form = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const dirty = useRef(false);
  const { id, report } = usePendingForm();
  const confirm = useConfirmDeparture();
  useLayoutEffect(() => {
    if (protectUnsaved && form.current && !dirty.current) baseline.current = readNativeValues(form.current);
  });
  function changed() {
    if (protectUnsaved && form.current && baseline.current !== null) {
      dirty.current = readNativeValues(form.current) !== baseline.current;
      report(dirty.current);
    }
  }
  return <form ref={form} action={formAction} onChange={changed} onReset={() => {
    // Observe React/native reset after it completes; never reset a form here.
    queueMicrotask(() => {
      if (protectUnsaved && form.current) {
        baseline.current = readNativeValues(form.current);
        dirty.current = false;
        report(false);
      }
    });
  }} onSubmit={event => {
    if (leavesEditor && !confirm(id)) event.preventDefault();
  }}>
    {state.message && <p role="alert">{state.message}</p>}
    {state.conflict && <p><button type="button" onClick={() => window.location.reload()}>{reloadLabel}</button></p>}
    <fieldset disabled={pending || state.conflict}>{children}</fieldset>
    {pending && <p role="status">Saving…</p>}
  </form>;
}
