import { describe, expect, it } from "vitest";
import { generateBoxStep } from "../generate-fixtures";
import { computeStepAabbExtents, extractFromStep } from "../../src/extraction/step";
import { renderPdfToImages, MAX_EDGE_PX } from "../../src/extraction/pdf";
import { assembleQuote } from "../../src/quote/assemble";
import { BASE_PER_LB } from "../../src/rules/catalog";
import fs from "node:fs";
import path from "node:path";

const priceBook = Object.entries(BASE_PER_LB).map(([alloyCode, basePerLb]) => ({
  id: `pb_${alloyCode}_2026-01-01`,
  alloyCode,
  basePerLb,
  effectiveDate: "2026-01-01",
  expiresDate: null,
}));

describe("STEP fixture path (no LLM, §10.6)", () => {
  it("S-block AABB computes to 6 × 4 × 1 in ± 0.01", async () => {
    const step = generateBoxStep(152.4, 101.6, 25.4);
    const extents = await computeStepAabbExtents(Buffer.from(step));
    const inches = extents.map((e) => e / 25.4).sort((a, b) => b - a);
    expect(inches[0]).toBeCloseTo(6, 2);
    expect(inches[1]).toBeCloseTo(4, 2);
    expect(inches[2]).toBeCloseTo(1, 2);
  });

  it("with form 6061-T651 qty 5 → priced quote with a visible −4% qty break", async () => {
    const step = generateBoxStep(152.4, 101.6, 25.4);
    const result = await extractFromStep(Buffer.from(step), {
      alloyCode: "6061",
      temper: "T651",
      qty: 5,
      units: "mm",
    });
    expect(result.ok).toBe(true);
    const q = assembleQuote({ extractionResult: result, priceBook, quoteDate: "2026-06-09" });
    expect(q.status).toBe("priced");
    expect(q.alloyCode).toBe("6061");
    expect(q.temper).toBe("T651");
    expect(q.qty).toBe(5);
    expect(q.breakdown!.linesCents.qtyBreakRate).toBe(0.04);
    expect(q.breakdown!.linesCents.qtyDiscount).toBeGreaterThan(0);
    // part 6×4×1 in → blank 1.25 × 4.25 × 6.25 (±0.01 per §10.6, AABB floats)
    expect(q.blank!.thicknessIn).toBe(1.25);
    expect(q.blank!.widthIn).toBeCloseTo(4.25, 2);
    expect(q.blank!.lengthIn).toBeCloseTo(6.25, 2);
  });
});

describe("PDF fixture render path (§5.2 steps 1–2)", () => {
  it("fixture A renders to ≥1 PNG within the 1568 px edge cap", async () => {
    const file = path.join(process.cwd(), "fixtures", "A-bracket-7075.pdf");
    if (!fs.existsSync(file)) {
      throw new Error("fixtures missing — run `npm run seed` first");
    }
    const images = await renderPdfToImages(fs.readFileSync(file));
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images.length).toBeLessThanOrEqual(3);
    // PNG magic bytes
    expect(images[0].subarray(0, 4).toString("hex")).toBe("89504e47");
    const { loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(images[0]);
    expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(MAX_EDGE_PX);
  });
});
