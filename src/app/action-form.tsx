"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "./action-state";

export function ActionForm({ action, children }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  return <form action={formAction}>
    {state.message && <p role="alert">{state.message}</p>}
    {state.conflict && <p><button type="button" onClick={() => window.location.reload()}>Reload location</button></p>}
    <fieldset disabled={pending || state.conflict}>{children}</fieldset>
    {pending && <p role="status">Saving…</p>}
  </form>;
}
