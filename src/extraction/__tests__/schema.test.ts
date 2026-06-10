import { describe, expect, it } from "vitest";
import { ExtractionSchema, type Extraction } from "../schema";

const valid: Extraction = {
  documentType: "part_drawing",
  drawingNumber: { value: "FC-1001", confidence: "high", source: "title_block" },
  drawingTitle: { value: "MOUNTING BRACKET", confidence: "high", source: "title_block" },
  units: { value: "in", confidence: "high", source: "title_block" },
  envelope: {
    a: { value: 7.5, confidence: "high", source: "dimension_callout" },
    b: { value: 3.2, confidence: "high", source: "dimension_callout" },
    c: { value: 1.1, confidence: "high", source: "dimension_callout" },
  },
  material: { rawText: "AL 7075-T651", confidence: "high", source: "title_block" },
  quantity: { value: 4, confidence: "high", source: "title_block" },
  toleranceNotes: ["±0.005 UNLESS OTHERWISE SPECIFIED"],
  flatnessCritical: { value: false, confidence: "medium", source: "notes" },
  ambiguities: [],
};

describe("ExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    expect(ExtractionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects source 'inferred' paired with 'high' confidence (refinement)", () => {
    const bad = structuredClone(valid);
    bad.units = { value: "in", confidence: "high", source: "inferred" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts 'inferred' with 'medium' or 'low'", () => {
    const ok = structuredClone(valid);
    ok.units = { value: "in", confidence: "low", source: "inferred" };
    expect(ExtractionSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects non-positive envelope dimensions", () => {
    const bad = structuredClone(valid);
    bad.envelope.a.value = 0;
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown units", () => {
    const bad = structuredClone(valid) as Record<string, unknown>;
    bad.units = { value: "cm", confidence: "high", source: "title_block" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-integer or non-positive quantity", () => {
    const bad = structuredClone(valid);
    bad.quantity.value = 2.5 as never;
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("allows null material rawText and null quantity", () => {
    const ok = structuredClone(valid);
    ok.material.rawText = null;
    ok.quantity.value = null as never;
    expect(ExtractionSchema.safeParse(ok).success).toBe(true);
  });

  it("caps toleranceNotes and ambiguities at 20", () => {
    const bad = structuredClone(valid);
    bad.ambiguities = Array.from({ length: 21 }, (_, i) => `a${i}`);
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects extra prose instead of JSON shape", () => {
    expect(ExtractionSchema.safeParse({ documentType: "part_drawing" }).success).toBe(false);
  });
});
