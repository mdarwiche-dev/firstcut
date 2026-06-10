// Intake endpoint (§8.1 → §5): accepts multipart form data for all three
// paths plus one-click fixture ids, runs the pipeline, persists, returns the
// quote id for redirect.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { getAnthropicClient } from "@/extraction/client";
import { extractFromPdf } from "@/extraction/pdf";
import { extractFromStep } from "@/extraction/step";
import { extractFromText } from "@/extraction/text";
import { ExtractionResult } from "@/extraction/schema";
import { assembleQuote } from "@/quote/assemble";
import { loadPriceBookRows, persistQuote } from "@/quote/persist";
import { applyNesting } from "@/nesting/inventory";
import type { NestingRecord } from "@/nesting/price";

export const runtime = "nodejs";

const PDF_MAX_BYTES = 10 * 1024 * 1024;
const STEP_MAX_BYTES = 25 * 1024 * 1024;

const FIXTURE_FILES: Record<string, string> = {
  A: "A-bracket-7075.pdf",
  B: "B-plate-metric.pdf",
  C: "C-manifold-316ss.pdf",
  D: "D-rail-oversize.pdf",
  S: "S-block.step",
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const inputType = String(form.get("inputType") ?? "");
    if (!["pdf", "step", "text"].includes(inputType)) {
      return NextResponse.json({ error: "invalid inputType" }, { status: 400 });
    }

    const settings = {
      sideAllowanceIn: clamp(num(form.get("sideAllowanceIn"), 0.125), 0, 0.5),
      minThicknessCleanupIn: clamp(num(form.get("minThicknessCleanupIn"), 0.1), 0, 0.5),
      dfars: form.get("dfars") === "true",
      qtyOverride: form.get("qtyOverride") ? Math.max(1, Math.floor(num(form.get("qtyOverride"), 1))) : null,
    };

    const quoteId = nanoid(12);
    let rawInputText: string | null = null;
    let rawInputFile: string | null = null;
    let extraction: ExtractionResult;

    // Input bytes: an uploaded file or a named fixture.
    const fixture = form.get("fixture") ? String(form.get("fixture")) : null;
    let buffer: Buffer | null = null;
    let originalName = "";
    if (fixture) {
      const file = FIXTURE_FILES[fixture];
      if (!file) return NextResponse.json({ error: "unknown fixture" }, { status: 400 });
      buffer = fs.readFileSync(path.join(process.cwd(), "fixtures", file));
      originalName = file;
    } else if (form.get("file")) {
      const f = form.get("file") as File;
      buffer = Buffer.from(await f.arrayBuffer());
      originalName = f.name;
    }

    if (inputType === "text") {
      rawInputText = String(form.get("text") ?? "").trim();
      if (!rawInputText) return NextResponse.json({ error: "empty spec text" }, { status: 400 });
      extraction = await extractFromText(rawInputText, getAnthropicClient());
    } else {
      if (!buffer) return NextResponse.json({ error: "missing file" }, { status: 400 });
      const ext = originalName.toLowerCase().slice(originalName.lastIndexOf("."));

      if (inputType === "pdf") {
        if (ext !== ".pdf") return NextResponse.json({ error: ".pdf only" }, { status: 400 });
        if (buffer.length > PDF_MAX_BYTES) return NextResponse.json({ error: "PDF over 10 MB" }, { status: 400 });
        rawInputFile = saveUpload(quoteId, ".pdf", buffer);
        extraction = await extractFromPdf(buffer, getAnthropicClient());
      } else {
        if (![".step", ".stp"].includes(ext)) return NextResponse.json({ error: ".step/.stp only" }, { status: 400 });
        if (buffer.length > STEP_MAX_BYTES) return NextResponse.json({ error: "STEP over 25 MB" }, { status: 400 });
        rawInputFile = saveUpload(quoteId, ext, buffer);
        extraction = await extractFromStep(buffer, {
          alloyCode: String(form.get("alloyCode") ?? "6061"),
          temper: form.get("temper") ? String(form.get("temper")) : null,
          qty: Math.max(1, Math.floor(num(form.get("qty"), 1))),
          units: form.get("units") === "in" ? "in" : "mm",
        });
      }
    }

    const priceBook = loadPriceBookRows();
    const quoteDate = new Date().toISOString().slice(0, 10);
    const assembled = assembleQuote({
      extractionResult: extraction,
      settings,
      priceBook,
      quoteDate,
    });

    // Stretch §12: nest priced quotes against plate inventory. Informational —
    // the official quote total stays the simple v1 breakdown either way.
    let nesting: NestingRecord | null = null;
    if (assembled.status === "priced" && assembled.blank && assembled.breakdown && assembled.alloyCode) {
      const b = assembled.breakdown;
      const pb = priceBook.find((r) => r.id === b.priceBookId);
      if (pb) {
        nesting = applyNesting({
          alloyCode: assembled.alloyCode,
          blank: assembled.blank,
          qty: assembled.qty,
          priceInput: {
            blank: { t: assembled.blank.thicknessIn, w: assembled.blank.widthIn, l: assembled.blank.lengthIn },
            densityLbIn3: b.inputs.densityLbIn3,
            basePerLb: pb.basePerLb,
            priceBookId: pb.id,
            qty: assembled.qty,
            dfars: settings.dfars,
            quoteDate,
          },
          simpleBreakdown: b,
        });
      }
    }

    persistQuote(assembled, { id: quoteId, rawInputText, rawInputFile, nesting });

    return NextResponse.json({ id: quoteId, status: assembled.status });
  } catch (e) {
    console.error("quote intake failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}

function num(v: FormDataEntryValue | null, fallback: number): number {
  if (v == null || v === "") return fallback; // Number(null) is 0, not NaN — don't let omitted fields zero out defaults
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function saveUpload(quoteId: string, ext: string, buffer: Buffer): string {
  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join("data", "uploads", `${quoteId}${ext}`);
  fs.writeFileSync(path.join(process.cwd(), rel), buffer);
  return rel;
}
