import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { LocationEditor } from "../../src/app/location-editor";
import { SessionDraftForm, SessionDraftSubmit } from "../../src/app/session-draft-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../src/app/location-actions", () => ({ readLocationAction: vi.fn(), updateLocationAction: vi.fn() }));
vi.mock("../../src/app/session-draft-actions", () => ({ readSessionDraftAction: vi.fn() }));

test("Location HTML disables editing and consultation before any client effect can run", () => {
  const html = renderToStaticMarkup(createElement(LocationEditor, { location: {
    id: "location", name: "Harbor", description: "Original description", revision: 7,
    archivedAt: null, deletedAt: null,
  } }));
  expect(html).toContain('<fieldset disabled="">');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('name="expectedRevision" value="7"');
  expect(html).toContain('disabled="">View persisted version</button>');
  expect(html).toContain("Editing this form requires JavaScript.");
});

test.each(["session", "scene", "session-outcome", "scene-outcome", "new-scene"] as const)(
  "%s HTML disables native fields and its submit before mounting, preserving child restrictions", kind => {
    const props: ComponentProps<typeof SessionDraftForm> = {
      sessionId: "session", target: kind === "scene" || kind === "scene-outcome" ? { kind, sceneId: "scene" } : { kind },
      snapshot: { revision: 9, values: { outcome: "Original outcome" }, unavailable: true },
      action: vi.fn(), children: undefined,
    };
    const html = renderToStaticMarkup(createElement(SessionDraftForm, props,
      createElement("textarea", { key: "outcome", name: "outcome", defaultValue: "Original outcome", readOnly: true }),
      createElement("input", { key: "disabled", name: "disabled", disabled: true }),
      createElement(SessionDraftSubmit, { key: "save" }, "Save"),
    ));
    expect(html).toContain('<fieldset disabled="">');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('name="expectedRevision" value="9"');
    expect(html).toMatch(/<textarea[^>]*readOnly=""/);
    expect(html).toMatch(/<input(?=[^>]*name="disabled")(?=[^>]*disabled="")[^>]*>/);
    expect(html).toContain('disabled="">Save</button>');
    expect(html).toContain('disabled="">View persisted values for this section</button>');
    expect(html).toContain("Editing this form requires JavaScript.");
  },
);
