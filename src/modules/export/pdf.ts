import pdfmake from "pdfmake";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { createRequire } from "node:module";

// Packaged fonts keep rendering independent of host fonts and network access.
const require = createRequire(import.meta.url);
const fonts = require("pdfmake/fonts/Roboto") as TFontDictionary;
const fontPaths = new Set(Object.values(fonts.Roboto));
pdfmake.addFonts(fonts);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(path => fontPaths.has(path));

export async function renderPdfDocument(document: TDocumentDefinitions): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await pdfmake.createPdf(document).getBuffer();
  return new Uint8Array(buffer);
}
