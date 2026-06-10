// The Zod extraction schema (§5.1) — single source of truth for Claude
// structured-output validation, the STEP/text adapters, and the rules-engine
// input type. The LLM never outputs alloy codes, prices, blank dimensions, or
// validity judgments.
import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export const FieldSource = z.enum([
  "title_block",        // read from the drawing title block
  "dimension_callout",  // read from a dimension line/callout
  "notes",              // general notes block on the drawing
  "user_text",          // pasted text input
  "geometry",           // computed from STEP AABB
  "form_field",         // user-supplied form value (e.g., STEP material)
  "inferred",           // LLM inferred it; must never be high confidence
]);

// `inferred` source must pair with `low` or `medium` confidence.
const notInferredHigh = (f: { confidence: string; source: string }) =>
  !(f.source === "inferred" && f.confidence === "high");
const INFERRED_MSG = { message: "source 'inferred' must not have 'high' confidence" };

const numField = z
  .object({ value: z.number().positive(), confidence: Confidence, source: FieldSource })
  .refine(notInferredHigh, INFERRED_MSG);
const nullableStrField = z
  .object({ value: z.string().nullable(), confidence: Confidence, source: FieldSource })
  .refine(notInferredHigh, INFERRED_MSG);

export const ExtractionSchema = z.object({
  documentType: z.enum(["part_drawing", "spec_text", "unknown"]),
  drawingNumber: nullableStrField,
  drawingTitle: nullableStrField,
  units: z
    .object({ value: z.enum(["in", "mm"]), confidence: Confidence, source: FieldSource })
    .refine(notInferredHigh, INFERRED_MSG),
  // The three overall bounding dimensions of the PART, in source units,
  // labeled as drawn. Downstream code treats them as an UNORDERED triple —
  // the LLM does NOT choose orientation; the rules engine does.
  envelope: z.object({
    a: numField, // typically the longest callout
    b: numField,
    c: numField, // typically the thickness callout
  }),
  material: z
    .object({
      rawText: z.string().nullable(), // verbatim, e.g. "AL 7075-T651", "ATP-5"
      confidence: Confidence,
      source: FieldSource,
    })
    .refine(notInferredHigh, INFERRED_MSG),
  quantity: z
    .object({
      value: z.number().int().positive().nullable(),
      confidence: Confidence,
      source: FieldSource,
    })
    .refine(notInferredHigh, INFERRED_MSG),
  toleranceNotes: z.array(z.string()).max(20), // captured verbatim, not interpreted
  flatnessCritical: z
    .object({ value: z.boolean(), confidence: Confidence, source: FieldSource })
    .refine(notInferredHigh, INFERRED_MSG),
  ambiguities: z.array(z.string()).max(20), // anything the model wasn't sure about
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export type ExtractionResult =
  | { ok: true; extraction: Extraction; inputType: "pdf" | "step" | "text" }
  | {
      ok: false;
      error: {
        stage: "render" | "llm" | "schema" | "parse";
        message: string;
        attempts: number;
        /** Raw model output of the final failed attempt (for the §8.2 error view). */
        raw?: string;
      };
    };
