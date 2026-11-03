import { expect, test, vi } from "vitest";
import { createPendingForms, leavesCurrentPage, nativeValues } from "../../src/app/unsaved-navigation-state";

test("saving or unmounting one form does not clear another, and repeated reports are inert", () => {
  const registry = createPendingForms(), listener = vi.fn();
  const unsubscribe = registry.subscribe(listener);
  registry.set("session", true); registry.set("scene", true);
  registry.set("session", true);
  expect(listener).toHaveBeenCalledTimes(2);
  registry.set("scene", false);
  expect(registry.pending()).toEqual([{ uncertain: false }]);
  expect(registry.pending("session")).toEqual([]);
  registry.remove("scene");
  expect(listener).toHaveBeenCalledTimes(3);
  registry.remove("session");
  expect(registry.pending()).toEqual([]);
  unsubscribe(); registry.set("another", true);
  expect(listener).toHaveBeenCalledTimes(4);
});

test("uncertainty stays registered even with no editable fields, until explicitly resolved or unmounted", () => {
  const registry = createPendingForms();
  registry.set("grant", false, true); registry.set("plan", true);
  expect(registry.pending("plan")).toEqual([{ uncertain: true }]);
  registry.remove("plan");
  expect(registry.pending()).toEqual([{ uncertain: true }]);
  registry.set("grant", false, false);
  expect(registry.pending()).toEqual([]);
});

test("native text comparisons preserve whitespace, normalize textarea newlines and ignore transport fields", () => {
  const baseline = [{ name: "notes", type: "textarea", value: "Original\r\nidea" }];
  expect(nativeValues(baseline)).toBe(nativeValues([
    { name: "notes", type: "textarea", value: "Original\nidea" },
    { name: "expectedRevision", type: "hidden", value: "42" },
    { name: "requestKey", type: "hidden", value: "new-key" },
    { name: "intent", type: "submit", value: "save" },
  ]));
  expect(nativeValues(baseline)).not.toBe(nativeValues([{ ...baseline[0], value: " Original\nidea" }]));
  expect(nativeValues(baseline)).toBe(nativeValues(baseline.map(field => ({ ...field }))));
});

test("checkbox groups, radios and selects compare actual choices and return clean after reversion", () => {
  const fields = [
    { name: "components", type: "checkbox", value: "a", checked: true },
    { name: "components", type: "checkbox", value: "b", checked: false },
    { name: "kind", type: "select-one", value: "GOLD" },
    { name: "mode", type: "radio", value: "first", checked: true },
    { name: "mode", type: "radio", value: "second", checked: false },
  ];
  const baseline = nativeValues(fields);
  fields[1].checked = true; expect(nativeValues(fields)).not.toBe(baseline);
  fields[1].checked = false; expect(nativeValues(fields)).toBe(baseline);
  fields[2].value = "ITEM"; expect(nativeValues(fields)).not.toBe(baseline);
  fields[2].value = "GOLD"; expect(nativeValues([...fields].reverse())).toBe(baseline);
});

test.each([
  ["/locations/a", false], ["#notes", false], ["/locations/a#notes", false],
  ["/locations/b", true], ["/locations/a?tab=other", true], ["https://elsewhere.test/locations/a", true],
])("departure classification for %s", (destination, leaves) => {
  expect(leavesCurrentPage("https://app.test/locations/a", destination)).toBe(leaves);
});
