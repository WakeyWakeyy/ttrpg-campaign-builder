import { expect, test } from "vitest";
import { renderSessionSheet, type SessionSheet } from "../../src/modules/export/session-sheet";

test("session sheet keeps preparation ordered and separates session and scene encounters", () => {
  const sheet: SessionSheet = {
    campaignName: "The long road", title: "The gate", plannedFor: "2026-10-20",
    preparation: "Ask the guard about the key.\nKeep the map nearby.", attendance: ["Mira", "Tomas"],
    previous: { title: "Arrival", outcome: "They took the northern path.", scenes: [{ title: "The bridge", outcome: "The guide stayed behind." }] },
    scenes: [{ id: "first", title: "At the gate", preparation: "The guards refuse entry." },
      { id: "second", title: "Inside", preparation: null }],
    encounters: [{ title: "Ambush", sceneId: null }, { title: "Gate watch", sceneId: "first" },
      { title: "Second patrol", sceneId: "first" }],
  };
  const output = renderSessionSheet(sheet);
  expect(output).toContain("Ask the guard about the key.\nKeep the map nearby.");
  expect(output).toContain("Mira, Tomas");
  expect(output).toContain("They took the northern path.");
  expect(output.indexOf("### 1. At the gate")).toBeLessThan(output.indexOf("### 2. Inside"));
  expect(output.indexOf("- Ambush")).toBeLessThan(output.indexOf("### 1. At the gate"));
  expect(output.indexOf("- Gate watch")).toBeGreaterThan(output.indexOf("### 1. At the gate"));
  expect(output).toContain("- Second patrol");
  expect(output).not.toContain("## Session outcome");
});

test("session sheet distinguishes unrecorded and empty attendance", () => {
  const base: SessionSheet = { campaignName: "Campaign", title: "Session", plannedFor: null,
    preparation: null, attendance: null, previous: null, scenes: [], encounters: [] };
  expect(renderSessionSheet(base)).toContain("## Attendance\n\nNot recorded.");
  expect(renderSessionSheet({ ...base, attendance: [] })).toContain("## Attendance\n\nNone recorded.");
  expect(renderSessionSheet(base)).toContain("No scenes planned.");
});
