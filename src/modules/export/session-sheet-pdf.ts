import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { SessionSheet } from "./session-sheet";
import { renderPdfDocument } from "./pdf";

/** Consume the authorized sheet directly; never interpret GM notes as markup. */
export function buildSessionSheetPdfDocument(sheet: SessionSheet): TDocumentDefinitions {
  const label = (value: string) => value.replace(/\s*\r?\n\s*/g, " ").trim();
  const heading = (text: string, level = 2): Content => ({ text, style: `heading${level}`, headlineLevel: level });
  const notes = (text: string | null): Content => ({ text: text?.trim() || "No notes yet.", margin: [0, 0, 0, 8] });
  const encounters = (sceneId: string | null): Content[] => {
    const titles = sheet.encounters.filter(encounter => encounter.sceneId === sceneId).map(encounter => label(encounter.title));
    return titles.length ? [heading(sceneId ? "Encounters" : "Session encounters", 3), { ul: titles, margin: [0, 0, 0, 8] }] : [];
  };
  return {
    pageSize: "A4", pageMargins: [48, 42, 48, 52],
    info: { title: label(sheet.title), subject: "Private GM session sheet", creator: "TTRPG Campaign Builder" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.25, color: "#24313b" },
    styles: {
      heading1: { fontSize: 24, bold: true, margin: [0, 0, 0, 12] },
      heading2: { fontSize: 16, bold: true, margin: [0, 16, 0, 9], color: "#264c5e" },
      heading3: { fontSize: 12, bold: true, margin: [0, 10, 0, 7] },
    },
    footer: (page, count) => ({ text: `GM only - ${page} / ${count}`, alignment: "right", fontSize: 8, color: "#52616b", margin: [48, 14, 48, 0] }),
    pageBreakBefore: (node, queries) => Boolean(node.headlineLevel && queries.getFollowingNodesOnPage().length === 0),
    content: [
      { text: "GM ONLY - PRIVATE SESSION SHEET", fontSize: 9, bold: true, color: "#52616b", margin: [0, 0, 0, 12] },
      heading(label(sheet.title), 1),
      { text: `Campaign: ${label(sheet.campaignName)}`, margin: [0, 0, 0, 5] },
      { text: `Planned date: ${sheet.plannedFor ?? "Not set"}`, margin: [0, 0, 0, 8] },
      { text: "Includes private GM plans and previous outcomes. Keep this document private.", fontSize: 9 },
      heading("Previous session"),
      ...(sheet.previous ? [
        { text: label(sheet.previous.title), bold: true, margin: [0, 0, 0, 7] } as Content,
        notes(sheet.previous.outcome),
        ...sheet.previous.scenes.flatMap(scene => [heading(label(scene.title), 3), notes(scene.outcome)]),
      ] : [{ text: "No previous session recorded." }]),
      heading("Attendance"),
      { text: sheet.attendance === null ? "Not recorded." : sheet.attendance.length ? sheet.attendance.map(label).join(", ") : "None recorded." },
      heading("Session preparation"), notes(sheet.preparation), ...encounters(null),
      heading("Scenes"),
      ...(!sheet.scenes.length ? [{ text: "No scenes planned." }] : []),
      ...sheet.scenes.flatMap((scene, index) => [
        heading(`${index + 1}. ${label(scene.title)}`, 3), notes(scene.preparation), ...encounters(scene.id),
      ]),
    ],
  };
}

/** Snapshot collection and authorization must finish before rendering. */
export async function renderSessionSheetPdf(sheet: SessionSheet): Promise<Uint8Array<ArrayBuffer>> {
  return renderPdfDocument(buildSessionSheetPdfDocument(sheet));
}
