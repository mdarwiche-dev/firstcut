import { describe, expect, it } from "vitest";
import type { Extraction, ExtractionResult } from "../../extraction/schema";
import { assembleQuote, PriceBookRow } from "../assemble";
import { BASE_PER_LB } from "../../rules/catalog";

const QUOTE_DATE = "2026-06-09"; // Tuesday

const priceBook: PriceBookRow[] = Object.entries(BASE_PER_LB).map(
  ([alloyCode, basePerLb]) => ({
    id: `pb_${alloyCode}_2026-01-01`,
    alloyCode,
    basePerLb,
    effectiveDate: "2026-01-01",
    expiresDate: null,
  }),
);

function makeExtraction(overrides: Partial<Extraction> = {}): ExtractionResult {
  const base: Extraction = {
    documentType: "part_drawing",
    drawingNumber: { value: "FC-1001", confidence: "high", source: "title_block" },
    drawingTitle: { value: "PART", confidence: "high", source: "title_block" },
    units: { value: "in", confidence: "high", source: "title_block" },
    envelope: {
      a: { value: 7.5, confidence: "high", source: "dimension_callout" },
      b: { value: 3.2, confidence: "high", source: "dimension_callout" },
      c: { value: 1.1, confidence: "high", source: "dimension_callout" },
    },
    material: { rawText: "AL 7075-T651", confidence: "high", source: "title_block" },
    quantity: { value: 4, confidence: "high", source: "title_block" },
    toleranceNotes: [],
    flatnessCritical: { value: false, confidence: "medium", source: "notes" },
    ambiguities: [],
  };
  return { ok: true, extraction: { ...base, ...overrides }, inputType: "pdf" };
}

describe("assembleQuote — T1/fixture-A happy path", () => {
  const q = assembleQuote({ extractionResult: makeExtraction(), priceBook, quoteDate: QUOTE_DATE });

  it("prices to exactly $292.09 (§7.3)", () => {
    expect(q.status).toBe("priced");
    expect(q.totalCents).toBe(29209);
    expect(q.alloyCode).toBe("7075");
    expect(q.temper).toBe("T651");
    expect(q.blank).toEqual({
      thicknessIn: 1.25,
      widthIn: 3.45,
      lengthIn: 7.75,
    });
    expect(q.assumptions).toHaveLength(0);
    expect(q.issues).toHaveLength(0);
    expect(q.shipDate).toBe("2026-06-11"); // 2 business days
    expect(q.validUntil).toBe("2026-06-23");
  });

  it("records all three orientation candidates with one chosen", () => {
    expect(q.orientations).toHaveLength(3);
    expect(q.orientations!.filter((o) => o.chosen)).toHaveLength(1);
  });
});

describe("assembleQuote — fixture-B shape (metric, no temper, no qty)", () => {
  const q = assembleQuote({
    extractionResult: makeExtraction({
      units: { value: "mm", confidence: "high", source: "notes" },
      envelope: {
        a: { value: 190, confidence: "high", source: "dimension_callout" },
        b: { value: 85, confidence: "high", source: "dimension_callout" },
        c: { value: 22, confidence: "high", source: "dimension_callout" },
      },
      material: { rawText: "AL 6061", confidence: "high", source: "title_block" },
      quantity: { value: null, confidence: "low", source: "inferred" },
    }),
    priceBook,
    quoteDate: QUOTE_DATE,
  });

  it("prices with exactly two assumptions: temper default and qty default", () => {
    expect(q.status).toBe("priced");
    expect(q.assumptions.map((a) => a.code).sort()).toEqual([
      "QTY_DEFAULTED",
      "TEMPER_DEFAULTED",
    ]);
    expect(q.temper).toBe("T651");
    expect(q.qty).toBe(1);
  });

  it("converts mm → in within ±0.005 (§10.3) and snaps blank per the fixture table", () => {
    expect(q.partEnvelope!.lengthIn).toBeCloseTo(7.48, 2);
    expect(q.partEnvelope!.widthIn).toBeCloseTo(3.346, 2);
    expect(q.partEnvelope!.thicknessIn).toBeCloseTo(0.866, 2);
    expect(q.blank!.thicknessIn).toBe(1.0);
    expect(q.blank!.widthIn).toBeCloseTo(3.596, 3);
    expect(q.blank!.lengthIn).toBeCloseTo(7.73, 3);
  });
});

describe("assembleQuote — by-request and unrecognized materials (fixture C)", () => {
  it("316 stainless → needs_review, BY_REQUEST_MATERIAL, no price", () => {
    const q = assembleQuote({
      extractionResult: makeExtraction({
        material: { rawText: "316 STAINLESS STEEL", confidence: "high", source: "title_block" },
      }),
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(q.status).toBe("needs_review");
    expect(q.issues[0].code).toBe("BY_REQUEST_MATERIAL");
    expect(q.breakdown).toBeNull();
    expect(q.totalCents).toBeNull();
    expect(q.alloyCode).toBe("SS_316");
  });

  it("titanium (OTHER_METAL) → by-request, no price", () => {
    const q = assembleQuote({
      extractionResult: makeExtraction({
        material: { rawText: "TI-6AL-4V", confidence: "high", source: "title_block" },
      }),
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(q.status).toBe("needs_review");
    expect(q.issues[0].code).toBe("BY_REQUEST_MATERIAL");
    expect(q.breakdown).toBeNull();
  });

  it("unrecognized text → MATERIAL_UNRECOGNIZED, no price", () => {
    const q = assembleQuote({
      extractionResult: makeExtraction({
        material: { rawText: "UNOBTAINIUM X9", confidence: "medium", source: "title_block" },
      }),
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(q.status).toBe("needs_review");
    expect(q.issues[0].code).toBe("MATERIAL_UNRECOGNIZED");
    expect(q.breakdown).toBeNull();
  });
});

describe("assembleQuote — oversize rejection (fixture D)", () => {
  const q = assembleQuote({
    extractionResult: makeExtraction({
      material: { rawText: "AL 6061-T6", confidence: "high", source: "title_block" },
      envelope: {
        a: { value: 150.0, confidence: "high", source: "dimension_callout" },
        b: { value: 20.0, confidence: "high", source: "dimension_callout" },
        c: { value: 1.0, confidence: "high", source: "dimension_callout" },
      },
      quantity: { value: 1, confidence: "high", source: "title_block" },
    }),
    priceBook,
    quoteDate: QUOTE_DATE,
  });

  it("rejects with NO_VALID_BLANK, no price, all three candidates invalid with reasons", () => {
    expect(q.status).toBe("rejected");
    expect(q.issues.some((i) => i.code === "NO_VALID_BLANK" && i.severity === "reject")).toBe(true);
    expect(q.breakdown).toBeNull();
    expect(q.totalCents).toBeNull();
    expect(q.shipDate).toBeNull();
    expect(q.orientations).toHaveLength(3);
    for (const o of q.orientations!) {
      expect(o.valid).toBe(false);
      expect(o.reason).toBeTruthy();
    }
  });
});

describe("assembleQuote — unspecified material recommendation (§5.5)", () => {
  const q = assembleQuote({
    extractionResult: makeExtraction({
      material: { rawText: null, confidence: "low", source: "inferred" },
    }),
    priceBook,
    quoteDate: QUOTE_DATE,
  });

  it("prices with recommended cheapest alloy but flags needs_review", () => {
    expect(q.status).toBe("needs_review");
    expect(q.alloyCode).toBe("6061");
    expect(q.assumptions.some((a) => a.code === "ALLOY_RECOMMENDED")).toBe(true);
    expect(q.issues.some((i) => i.code === "ALLOY_RECOMMENDED" && i.severity === "review")).toBe(true);
    expect(q.breakdown).not.toBeNull(); // priced, but flagged
  });
});

describe("assembleQuote — confidence mapping (§5.6)", () => {
  it("low-confidence dimension still prices but needs review", () => {
    const q = assembleQuote({
      extractionResult: makeExtraction({
        envelope: {
          a: { value: 7.5, confidence: "low", source: "inferred" },
          b: { value: 3.2, confidence: "high", source: "dimension_callout" },
          c: { value: 1.1, confidence: "high", source: "dimension_callout" },
        },
      }),
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(q.status).toBe("needs_review");
    expect(q.issues.some((i) => i.code === "LOW_CONFIDENCE_DIMENSION")).toBe(true);
    expect(q.breakdown).not.toBeNull();
    expect(q.totalCents).toBe(29209); // price still computed
  });

  it("flatness callout adds the cast-plate note without price effect", () => {
    const q = assembleQuote({
      extractionResult: makeExtraction({
        flatnessCritical: { value: true, confidence: "high", source: "notes" },
      }),
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(q.assumptions.some((a) => a.code === "FLATNESS_NOTE")).toBe(true);
    expect(q.totalCents).toBe(29209);
    expect(q.status).toBe("priced");
  });

  it("qty override beats extracted qty without an assumption", () => {
    const q = assembleQuote({
      extractionResult: makeExtraction(),
      settings: { qtyOverride: 10 },
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(q.qty).toBe(10);
    expect(q.assumptions.find((a) => a.code === "QTY_DEFAULTED")).toBeUndefined();
    expect(q.breakdown!.linesCents.qtyBreakRate).toBe(0.07);
  });
});

describe("assembleQuote — extraction failure (§8.2, T3 shape)", () => {
  it("structured error → extraction_failed, no numbers anywhere", () => {
    const failed: ExtractionResult = {
      ok: false,
      error: { stage: "schema", message: "validation failed twice", attempts: 2 },
    };
    const q = assembleQuote({ extractionResult: failed, priceBook, quoteDate: QUOTE_DATE });
    expect(q.status).toBe("extraction_failed");
    expect(q.breakdown).toBeNull();
    expect(q.totalCents).toBeNull();
    expect(q.blank).toBeNull();
    expect(q.partEnvelope).toBeNull();
  });
});

describe("assembleQuote — DFARS toggle", () => {
  it("adds the +12% material adder and +2 lead days", () => {
    const off = assembleQuote({ extractionResult: makeExtraction(), priceBook, quoteDate: QUOTE_DATE });
    const on = assembleQuote({
      extractionResult: makeExtraction(),
      settings: { dfars: true },
      priceBook,
      quoteDate: QUOTE_DATE,
    });
    expect(on.breakdown!.linesCents.dfarsAdder).toBe(
      Math.round(off.breakdown!.linesCents.material * 0.12),
    );
    expect(on.breakdown!.leadTime.days).toBe(off.breakdown!.leadTime.days + 2);
  });
});
