export type PendingForm = { uncertain: boolean };

// Only identities and flags live here. Values, revisions and retry commands stay
// with their editors. Removing one form never clears a sibling's registration.
export function createPendingForms() {
  const forms = new Map<string, PendingForm>();
  const listeners = new Set<() => void>();
  return {
    set(id: string, pending: boolean, uncertain = false) {
      const previous = forms.get(id);
      if (!pending && !uncertain) {
        if (!forms.delete(id)) return;
      } else {
        if (previous?.uncertain === uncertain) return;
        forms.set(id, { uncertain });
      }
      listeners.forEach(listener => listener());
    },
    remove(id: string) { this.set(id, false); },
    pending(except?: string) { return [...forms].filter(([id]) => id !== except).map(([, flag]) => flag); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

type NativeField = { name: string; type: string; value: string; checked?: boolean };
export function nativeValues(fields: Iterable<NativeField>) {
  const values: Record<string, string[]> = {};
  for (const field of fields) {
    if (!field.name || ["hidden", "submit", "button", "reset", "file"].includes(field.type)) continue;
    const items = values[field.name] ??= [];
    if (!["checkbox", "radio"].includes(field.type) || field.checked) items.push(field.value.replaceAll("\r\n", "\n"));
  }
  return JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => [key, items.sort()]));
}

// Read controls rather than FormData: temporarily disabled controls still hold
// drafts and must not disappear when a request or Trash makes them unavailable.
export function readNativeValues(form: HTMLFormElement) {
  return nativeValues(Array.from(form.elements).flatMap<NativeField>(control => {
    if (control instanceof HTMLSelectElement) return Array.from(control.selectedOptions)
      .map(option => ({ name: control.name, type: control.type, value: option.value }));
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return [{
      name: control.name, type: control.type, value: control.value,
      checked: control instanceof HTMLInputElement && control.checked,
    }];
    return [];
  }));
}

export function leavesCurrentPage(current: string, destination: string) {
  const from = new URL(current), to = new URL(destination, from);
  return from.origin !== to.origin || from.pathname !== to.pathname || from.search !== to.search;
}
