import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { CampaignExport, CampaignReferenceBlock } from "./index";
import { buildCampaignModule } from "./campaign-module";
import { renderPdfDocument } from "./pdf";

/** Only typed editorial headings become navigation; authored text stays literal. */
function referenceContent(blocks: CampaignReferenceBlock[]): Content[] {
  return blocks.map(block => {
    if (block.kind === "heading") return {
      text: block.text, style: `heading${block.level}`, headlineLevel: block.level,
      ...(block.level === 2 ? { tocItem: true, outline: true } : {}),
    };
    if (block.kind === "field") return {
      text: [{ text: `${block.label}: `, bold: true }, { text: block.text }], margin: [0, 0, 0, 7],
    };
    return { text: block.text, margin: [0, 0, 0, 7] };
  });
}

export function buildCampaignPdfDocument(snapshot: CampaignExport): TDocumentDefinitions {
  const document = buildCampaignModule(snapshot);
  return {
    pageSize: "A4", pageMargins: [48, 48, 48, 52],
    info: { title: String(snapshot.campaign.name), subject: "Private GM campaign module", creator: "TTRPG Campaign Builder" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.25, color: "#24313b" },
    styles: {
      heading1: { fontSize: 25, bold: true, margin: [0, 0, 0, 18] },
      heading2: { fontSize: 18, bold: true, margin: [0, 18, 0, 12], color: "#264c5e" },
      heading3: { fontSize: 14, bold: true, margin: [0, 14, 0, 8] },
      heading4: { fontSize: 11, bold: true, margin: [0, 10, 0, 7] },
    },
    footer: (page, count) => ({ text: `GM only - ${page} / ${count}`, alignment: "right", fontSize: 8, color: "#52616b", margin: [48, 14, 48, 0] }),
    pageBreakBefore: (node, queries) => Boolean(node.headlineLevel && queries.getFollowingNodesOnPage().length === 0),
    content: [
      { text: "GM ONLY - PRIVATE CAMPAIGN MODULE", fontSize: 9, bold: true, color: "#52616b", margin: [0, 0, 0, 14] },
      { text: "Includes hidden information and recorded outcomes. Keep this document private.", margin: [0, 0, 0, 18] },
      ...referenceContent(document.introduction.blocks),
      { toc: { title: { text: "Contents", style: "heading2" }, textMargin: [0, 4, 0, 4] } },
      ...document.chapters.flatMap(chapter => [
        { text: chapter.title, style: "heading2", headlineLevel: 2, pageBreak: "before", tocItem: true, outline: true } as Content,
        ...referenceContent(chapter.reference.blocks),
      ]),
      ...(!document.chapters.length ? [{ text: "No available campaign material has been recorded yet.", margin: [0, 16, 0, 0] } as Content] : []),
    ],
  };
}

/** The caller must supply the owner-authorized, consistent export snapshot. */
export async function renderCampaignPdf(snapshot: CampaignExport): Promise<Uint8Array<ArrayBuffer>> {
  return renderPdfDocument(buildCampaignPdfDocument(snapshot));
}
