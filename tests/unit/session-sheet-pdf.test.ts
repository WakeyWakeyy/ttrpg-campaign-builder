import { expect, test } from "vitest";
import { buildSessionSheetPdfDocument, renderSessionSheetPdf } from "../../src/modules/export/session-sheet-pdf";
import type { SessionSheet } from "../../src/modules/export/session-sheet";

const sheet: SessionSheet = {
  campaignName: "El faro de la Peña", title: "La llegada - Έλενα y Борис", plannedFor: "2026-10-20",
  preparation: "## Emboscada\n\n**Outcome:** sigue siendo un plan.\n[Mapa](file:///private) <img src='https://invalid.example'>",
  attendance: ["Mira", "Tomás"],
  previous: { title: "El camino", outcome: "Encontraron una llave.", scenes: [{ title: "El puente", outcome: "El guía se quedó atrás." }] },
  scenes: [{ id: "gate", title: "La puerta", preparation: "Hablar con la guardia." }, { id: "tower", title: "La torre", preparation: null }],
  encounters: [{ title: "Una patrulla", sceneId: null }, { title: "La guardia", sceneId: "gate" }, { title: "Otra guardia", sceneId: "gate" }],
};

test("PDF sheet keeps previous outcomes, attendance, ordered preparation and encounter placement", () => {
  const before = JSON.stringify(sheet);
  const document = buildSessionSheetPdfDocument(sheet);
  const content = JSON.stringify(document.content);
  expect(document.pageSize).toBe("A4");
  for (const text of ["GM ONLY", "2026-10-20", "Mira, Tomás", "Encontraron una llave.", "El guía se quedó atrás.", "Otra guardia", "No notes yet."]) {
    expect(content).toContain(text);
  }
  expect(content.indexOf("Encontraron una llave.")).toBeLessThan(content.indexOf("Session preparation"));
  expect(content.indexOf("Una patrulla")).toBeLessThan(content.indexOf("1. La puerta"));
  expect(content.indexOf('"La guardia"')).toBeGreaterThan(content.indexOf("1. La puerta"));
  expect(content.indexOf('"La guardia"')).toBeLessThan(content.indexOf("2. La torre"));
  expect(JSON.stringify(sheet)).toBe(before);
});

test("authored notes stay literal and cannot introduce navigation or resources", () => {
  const content = buildSessionSheetPdfDocument(sheet).content as Array<{ text?: string; headlineLevel?: number }>;
  expect(content).toContainEqual({ text: sheet.preparation, margin: [0, 0, 0, 8] });
  expect(content.filter(node => node.headlineLevel).map(node => node.text)).not.toContain("Emboscada");
  expect(JSON.stringify(content)).not.toMatch(/"(?:link|image|tocItem|outline)":/);
});

test.each([null, []] as (string[] | null)[])("empty sheets distinguish attendance state %j", attendance => {
  const content = JSON.stringify(buildSessionSheetPdfDocument({ ...sheet, plannedFor: null, preparation: null, attendance, previous: null, scenes: [], encounters: [] }).content);
  expect(content).toContain(attendance === null ? "Not recorded." : "None recorded.");
  expect(content).toContain("Not set");
  expect(content).toContain("No previous session recorded.");
  expect(content).toContain("No scenes planned.");
});

test("real PDF embeds fonts, paginates long notes and ends with a complete document", async () => {
  const pdf = Buffer.from(await renderSessionSheetPdf({ ...sheet, preparation: "El dragón recuerda el puerto. ".repeat(1600) })).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(pdf).toContain("/FontFile2");
  expect([...pdf.matchAll(/\/Type \/Page\b/g)].length).toBeGreaterThan(3);
});
