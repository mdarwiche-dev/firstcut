// Path 2 — STEP file (§5.3). Pure geometry via occt-import-js AABB; no LLM.
// Units default to mm (the common case) and are user-confirmable in the UI;
// material/quantity come from required form fields.
import { alloyByCode } from "../rules/catalog";
import { Extraction, ExtractionResult, ExtractionSchema } from "./schema";

export interface StepFormInput {
  alloyCode: string;
  temper: string | null;
  qty: number;
  /** Confirmed in the UI; defaults to mm. */
  units: "mm" | "in";
}

interface OcctMesh {
  attributes: { position: { array: number[] } };
}

export async function computeStepAabbExtents(
  stepBuffer: Buffer,
): Promise<[number, number, number]> {
  const occtimportjs = (await import("occt-import-js")).default;
  const occt = await occtimportjs();
  const result = occt.ReadStepFile(new Uint8Array(stepBuffer), null);
  if (!result.success || !result.meshes?.length) {
    throw new Error("occt-import-js could not parse the STEP file (no solids found)");
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of result.meshes as OcctMesh[]) {
    const pos = mesh.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const v = pos[i + axis];
        if (v < min[axis]) min[axis] = v;
        if (v > max[axis]) max[axis] = v;
      }
    }
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

/**
 * Material rawText reconstructed so the deterministic normalizer (§5.5)
 * round-trips the form selection losslessly (CAST_TJ → "ATP-5").
 */
export function formMaterialRawText(alloyCode: string, temper: string | null): string {
  if (alloyCode === "CAST_TJ") return "ATP-5";
  return temper ? `${alloyCode}-${temper}` : alloyCode;
}

export async function extractFromStep(
  stepBuffer: Buffer,
  form: StepFormInput,
): Promise<ExtractionResult> {
  let extents: [number, number, number];
  try {
    extents = await computeStepAabbExtents(stepBuffer);
  } catch (e) {
    return {
      ok: false,
      error: {
        stage: "parse",
        message: e instanceof Error ? e.message : String(e),
        attempts: 1,
      },
    };
  }

  if (!alloyByCode(form.alloyCode)) {
    return {
      ok: false,
      error: { stage: "parse", message: `unknown alloy code ${form.alloyCode}`, attempts: 1 },
    };
  }

  const geo = { confidence: "high", source: "geometry" } as const;
  const form_ = { confidence: "high", source: "form_field" } as const;
  const extraction: Extraction = {
    documentType: "unknown", // the enum's reserved value for non-drawing inputs
    drawingNumber: { value: null, ...geo },
    drawingTitle: { value: null, ...geo },
    units: { value: form.units, ...form_ },
    envelope: {
      a: { value: extents[0], ...geo },
      b: { value: extents[1], ...geo },
      c: { value: extents[2], ...geo },
    },
    material: { rawText: formMaterialRawText(form.alloyCode, form.temper), ...form_ },
    quantity: { value: form.qty, ...form_ },
    toleranceNotes: [],
    flatnessCritical: { value: false, ...geo },
    ambiguities: ["envelope computed from STEP AABB; internal features ignored"],
  };

  // Same gate as the LLM paths: nothing unvalidated crosses to the rules engine
  // (catches e.g. degenerate zero-extent geometry).
  const checked = ExtractionSchema.safeParse(extraction);
  if (!checked.success) {
    return {
      ok: false,
      error: { stage: "schema", message: checked.error.message, attempts: 1 },
    };
  }
  return { ok: true, extraction: checked.data, inputType: "step" };
}
