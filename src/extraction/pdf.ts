// Path 1 — PDF part drawing (§5.2). Render pages to PNG (~150 DPI, max 3
// pages, longest edge ≤ 1568 px), send all pages in one Claude message.
import { ExtractionResult } from "./schema";
import { extractViaClaude, ContentBlockParam, MinimalAnthropicClient } from "./llm";

export const MAX_PAGES = 3;
export const MAX_EDGE_PX = 1568;
const RENDER_DPI = 150;

export async function renderPdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const { pdf } = await import("pdf-to-img");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");

  const document = await pdf(new Uint8Array(pdfBuffer), { scale: RENDER_DPI / 72 });
  const pages: Buffer[] = [];
  for await (const page of document) {
    const img = await loadImage(page);
    const longest = Math.max(img.width, img.height);
    if (longest > MAX_EDGE_PX) {
      const s = MAX_EDGE_PX / longest;
      const canvas = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      pages.push(canvas.toBuffer("image/png"));
    } else {
      pages.push(Buffer.from(page));
    }
    if (pages.length >= MAX_PAGES) break;
  }
  if (pages.length === 0) throw new Error("PDF rendered zero pages");
  return pages;
}

export async function extractFromPdf(
  pdfBuffer: Buffer,
  client: MinimalAnthropicClient,
): Promise<ExtractionResult> {
  let images: Buffer[];
  try {
    images = await renderPdfToImages(pdfBuffer);
  } catch (e) {
    return {
      ok: false,
      error: {
        stage: "render",
        message: e instanceof Error ? e.message : String(e),
        attempts: 1,
      },
    };
  }

  const userContent: ContentBlockParam[] = [
    ...images.map((png) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: png.toString("base64"),
      },
    })),
    {
      type: "text",
      text: "Extract the part specification from this drawing (all pages shown). Output only the JSON object.",
    },
  ];

  return extractViaClaude({ client, userContent, inputType: "pdf" });
}
