import { expect, test } from "vitest";
import { buildCampaignPdfDocument, renderCampaignPdf } from "../../src/modules/export/campaign-pdf";
import type { CampaignExport } from "../../src/modules/export";

const snapshot: CampaignExport = {
  formatVersion: 1, campaign: { name: "El faro de la Peña — Έλενα — Борис" },
  ruleset: { key: "srd", version: "5.2.1", name: "Rules" },
  records: {
    campaign_compass: [{ current_premise: "¿Quién guarda el faro?" }],
    campaign_entity: [{ id: "secret" }, { id: "session" },
      { id: "old", archived_at: "2026-01-01" }, { id: "gone", deleted_at: "2026-01-01" }],
    secret: [{ id: "secret", name: "La verdad", content: "Un dragón duerme allí." },
      { id: "old", name: "Archived secret" }, { id: "gone", name: "Trashed secret" }],
    session: [{ id: "session", title: "Llegada", preparation: "Buscar el faro", outcome: "Encontraron una llave" }],
    scene: [{ id: "scene", session_id: "session", title: "La puerta", position: 1,
      preparation: "Leave [this](file:///private) and <img src='https://invalid.example'> literal", outcome: "Abierta" },
    { id: "removed", session_id: "session", title: "Removed scene", deleted_at: "2026-01-01" }],
    reward_grant: [{ id: "grant", reward_title: "Una antigua promesa", recipient: "El grupo" }],
  },
};

test("PDF model shares module filtering, indexed chapters, original words, and separate plans and outcomes", () => {
  const before = JSON.stringify(snapshot);
  const definition = buildCampaignPdfDocument(snapshot);
  const content = JSON.stringify(definition.content);
  expect(content).toContain("GM ONLY");
  expect(content).toContain("¿Quién guarda el faro?");
  expect(content).toContain("Secrets and discovery");
  expect(content).toContain("Un dragón duerme allí.");
  expect(content).toContain('"text":"Preparation: ","bold":true');
  expect(content).toContain("Buscar el faro");
  expect(content).toContain('"text":"Outcome: ","bold":true');
  expect(content).toContain("Encontraron una llave");
  expect(content).toContain("Una antigua promesa");
  expect(content).not.toMatch(/Archived secret|Trashed secret|Removed scene/);
  expect(content).toContain("file:///private");
  expect(content).toContain("<img src='https://invalid.example'>");
  expect(definition.pageSize).toBe("A4");
  expect(content).toContain('"tocItem":true');
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("an empty campaign remains a readable document", async () => {
  const empty = { ...snapshot, records: {} };
  expect(JSON.stringify(buildCampaignPdfDocument(empty).content)).toContain("No available campaign material");
  const pdf = Buffer.from(await renderCampaignPdf(empty)).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(pdf).toContain("/FontFile2"); // Embedded fonts, independent of the reader's machine.
});

test("GM Markdown-looking paragraphs remain literal and never become PDF navigation", async () => {
  const authored = structuredClone(snapshot);
  authored.campaign.description = "## Ambush";
  authored.records.scene[0].preparation = "## Secret entrance\n\n**Outcome:** This is still preparation.\n\n- **Scene: a literal note**";
  const definition = buildCampaignPdfDocument(authored);
  const content = definition.content as Array<{ text?: unknown; headlineLevel?: number; tocItem?: boolean; outline?: boolean }>;
  expect(content).toContainEqual({ text: "## Ambush", margin: [0, 0, 0, 7] });
  expect(content).toContainEqual({ text: authored.records.scene[0].preparation, margin: [0, 0, 0, 7] });
  const navigation = content.filter(node => node.tocItem || node.outline);
  expect(navigation.map(node => node.text)).toEqual(["Campaign compass", "Secrets and discovery", "Sessions and history", "Encounters and rewards"]);
  expect(content.filter(node => node.headlineLevel).some(node => String(node.text).includes("Ambush"))).toBe(false);
  expect(Buffer.from(await renderCampaignPdf(authored)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("long records paginate in a real PDF and preserve a final complete document", async () => {
  const long = structuredClone(snapshot);
  long.records.secret[0].content = "El dragón conserva la memoria del puerto. ".repeat(1500);
  const pdf = Buffer.from(await renderCampaignPdf(long)).toString("latin1");
  const pages = [...pdf.matchAll(/\/Type \/Page\b/g)];
  expect(pages.length).toBeGreaterThan(3);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(pdf).toContain("/Outlines");
});
