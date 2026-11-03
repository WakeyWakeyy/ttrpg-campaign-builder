"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useId, useLayoutEffect, useState,
  type ComponentProps, type ReactNode } from "react";
import { createPendingForms, leavesCurrentPage } from "./unsaved-navigation-state";

const PendingForms = createContext<ReturnType<typeof createPendingForms> | null>(null);

export function UnsavedNavigationProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createPendingForms);
  useLayoutEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const update = () => {
      if (registry.pending().length) window.addEventListener("beforeunload", warn);
      else window.removeEventListener("beforeunload", warn);
    };
    const unsubscribe = registry.subscribe(update);
    update();
    return () => { unsubscribe(); window.removeEventListener("beforeunload", warn); };
  }, [registry]);
  return <PendingForms.Provider value={registry}>{children}</PendingForms.Provider>;
}

export function usePendingForm() {
  const registry = useContext(PendingForms);
  const id = useId();
  const report = useCallback((pending: boolean, uncertain = false) => registry?.set(id, pending, uncertain), [registry, id]);
  useLayoutEffect(() => () => registry?.remove(id), [registry, id]);
  return { id, report };
}

export function useConfirmDeparture() {
  const registry = useContext(PendingForms);
  return (except?: string) => {
    const pending = registry?.pending(except) ?? [];
    if (!pending.length) return true;
    return window.confirm(pending.some(form => form.uncertain)
      ? "A grant response is unconfirmed; it may already be recorded. Leaving loses the local retry details, not the server transaction. Cancel to stay and check the ledger or retry the same request. OK to leave."
      : "You have unsaved changes. Cancel to stay and keep all drafts. OK to discard local drafts and continue without saving them.");
  };
}

export function GuardedLink({ onNavigate, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const confirm = useConfirmDeparture();
  return <Link {...props} onNavigate={event => {
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; event.preventDefault(); } });
    if (!prevented && leavesCurrentPage(window.location.href, props.href)
      && !confirm()) event.preventDefault();
  }} />;
}
