import pdfmake from "pdfmake";
import type { Content, TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { createRequire } from "node:module";
import type { CampaignExport } from "./index";
import { buildCampaignModule } from "./campaign-module";

// The package supplies and licenses its fonts. Resolve them in Node so production
// uses the same files as tests, without a browser, network access or host fonts.
const require = createRequire(import.meta.url);
const fonts = require("pdfmake/fonts/Roboto") as TFontDictionary;
const fontPaths = new Set(Object.values(fonts.Roboto));
pdfmake.addFonts(fonts);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(path => fontPaths.has(path));

/** Render only the reference's text conventions. GM text is never HTML or a resource URL. */
function referenceContent(markdown: string): Content[] {
  return markdown.split(/\n\s*\n/).filter(Boolean).map(paragraph => {
    const heading = /^(#{1,4}) (.*)$/.exec(paragraph);
    if (heading) return {
      text: heading[2], style: `heading${heading[1].length}`, headlineLevel: heading[1].length,
      ...(heading[1].length === 2 ? { tocItem: true, outline: true } : {}),
    };
    const label = /^\*\*([^*]+:)\*\* ([\s\S]*)$/.exec(paragraph);
    if (label) return { text: [{ text: `${label[1]} `, bold: true }, { text: label[2] }], margin: [0, 0, 0, 7] };
    const scene = /^- \*\*(Scene: .*?)\*\*$/.exec(paragraph);
    if (scene) return { text: scene[1], bold: true, margin: [0, 6, 0, 7] };
    if (paragraph.startsWith("- ")) return {
      text: paragraph.split("\n").flatMap((line, index) => {
        const field = /^- \*\*([^*]+:)\*\* (.*)$/.exec(line);
        return [
          ...(index ? [{ text: "\n" }] : []),
          ...(field ? [{ text: `- ${field[1]} `, bold: true }, { text: field[2] }] : [{ text: line }]),
        ];
      }), margin: [0, 0, 0, 7],
    };
    // Preserve literal user-authored Markdown, links, and special characters.
    return { text: paragraph, margin: [0, 0, 0, 7] };
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
      ...referenceContent(document.introduction),
      { toc: { title: { text: "Contents", style: "heading2" }, textMargin: [0, 4, 0, 4] } },
      ...document.chapters.flatMap(chapter => [
        { text: chapter.title, style: "heading2", headlineLevel: 2, pageBreak: "before", tocItem: true, outline: true } as Content,
        ...referenceContent(chapter.content),
      ]),
      ...(!document.chapters.length ? [{ text: "No available campaign material has been recorded yet.", margin: [0, 16, 0, 0] } as Content] : []),
    ],
  };
}

/** The caller must supply the owner-authorized, consistent export snapshot. */
export async function renderCampaignPdf(snapshot: CampaignExport): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await pdfmake.createPdf(buildCampaignPdfDocument(snapshot)).getBuffer();
  return new Uint8Array(buffer);
}
