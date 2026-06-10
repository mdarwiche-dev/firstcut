// Deterministic quote assembly: validated ExtractionResult → status, blank,
// orientation candidates, assumptions/issues, and priced breakdown (§5.5,
// §5.6, §6, §7). Pure: catalog and price book rows are passed in; persistence
// lives in persist.ts. Status precedence: rejected > needs_review > priced.
import { Extraction, ExtractionResult } from "../extraction/schema";
import { alloyByCode, AlloyRow } from "../rules/catalog";
import {
  BlankSettings,
  computeBlank,
  DEFAULT_SETTINGS,
  OrientationCandidate,
  recommendCheapestAlloy,
} from "../rules/computeBlank";
import { normalizeMaterial } from "../rules/normalizeMaterial";
import { Breakdown, priceQuote } from "../pricing/price";
import { addCalendarDays } from "../pricing/leadTime";

export interface PriceBookRow {
  id: string;
  alloyCode: string;
  basePerLb: number;
  effectiveDate: string;
  expiresDate: string | null;
}

export interface QuoteSettings extends BlankSettings {
  dfars: boolean;
  qtyOverride?: number | null;
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  ...DEFAULT_SETTINGS,
  dfars: false,
  qtyOverride: null,
};

export interface Assumption {
  code: string;
  message: string;
}
export interface Issue {
  code: string;
  severity: "review" | "reject";
  message: string;
}

export type QuoteStatus = "priced" | "needs_review" | "rejected" | "extraction_failed";

export interface AssembledQuote {
  status: QuoteStatus;
  inputType: "pdf" | "step" | "text";
  extractionResult: ExtractionResult;
  /** Sorted desc: lengthIn ≥ widthIn ≥ thicknessIn. Inches. */
  partEnvelope: {
    lengthIn: number;
    widthIn: number;
    thicknessIn: number;
    sourceUnits: "in" | "mm";
  } | null;
  blank: { thicknessIn: number; widthIn: number; lengthIn: number } | null;
  orientations: OrientationCandidate[] | null;
  alloyCode: string | null;
  temper: string | null;
  qty: number;
  breakdown: Breakdown | null;
  assumptions: Assumption[];
  issues: Issue[];
  settings: QuoteSettings;
  quoteDate: string;
  validUntil: string;
  shipDate: string | null;
  totalCents: number | null;
}

export function assembleQuote(opts: {
  extractionResult: ExtractionResult;
  settings?: Partial<QuoteSettings>;
  priceBook: PriceBookRow[];
  quoteDate: string; // ISO YYYY-MM-DD
}): AssembledQuote {
  const settings: QuoteSettings = { ...DEFAULT_QUOTE_SETTINGS, ...opts.settings };
  const { extractionResult, quoteDate } = opts;
  const validUntil = addCalendarDays(quoteDate, 14);

  const base: AssembledQuote = {
    status: "extraction_failed",
    inputType: extractionResult.ok ? extractionResult.inputType : "text",
    extractionResult,
    partEnvelope: null,
    blank: null,
    orientations: null,
    alloyCode: null,
    temper: null,
    qty: 1,
    breakdown: null,
    assumptions: [],
    issues: [],
    settings,
    quoteDate,
    validUntil,
    shipDate: null,
    totalCents: null,
  };

  if (!extractionResult.ok) return base; // §8.2 error state; never a fabricated quote
  const ex = extractionResult.extraction;
  base.inputType = extractionResult.inputType;

  const assumptions = base.assumptions;
  const issues = base.issues;

  // ---- Envelope: convert to inches; treat as unordered triple.
  const sourceUnits = ex.units.value;
  const toIn = (v: number) => (sourceUnits === "mm" ? v / 25.4 : v);
  const dims = [ex.envelope.a.value, ex.envelope.b.value, ex.envelope.c.value].map(toIn) as [
    number,
    number,
    number,
  ];
  const sorted = [...dims].sort((x, y) => y - x);
  base.partEnvelope = {
    lengthIn: sorted[0],
    widthIn: sorted[1],
    thicknessIn: sorted[2],
    sourceUnits,
  };

  // ---- Quantity (§5.6): override > extracted > default 1 with assumption.
  if (settings.qtyOverride != null) {
    base.qty = settings.qtyOverride;
  } else if (ex.quantity.value != null) {
    base.qty = ex.quantity.value;
  } else {
    base.qty = 1;
    assumptions.push({
      code: "QTY_DEFAULTED",
      message: "Quantity not specified — defaulted to 1.",
    });
  }

  // ---- Confidence → behavior (§5.6).
  const envelopeFields = [ex.envelope.a, ex.envelope.b, ex.envelope.c, ex.units];
  if (envelopeFields.some((f) => f.confidence === "low")) {
    issues.push({
      code: "LOW_CONFIDENCE_DIMENSION",
      severity: "review",
      message:
        "One or more envelope dimensions (or the units) were extracted with low confidence — verify before use.",
    });
  }
  if (ex.flatnessCritical.value) {
    assumptions.push({
      code: "FLATNESS_NOTE",
      message:
        "Flatness callout present — cast tool & jig plate may be preferred. No price effect in v1.",
    });
  }

  // ---- Material normalization + outcome mapping (§5.5).
  const match = normalizeMaterial(ex.material.rawText);
  let alloy: AlloyRow | null = null;

  switch (true) {
    case match.alloyCode === "UNSPECIFIED": {
      const rec = recommendCheapestAlloy(dims, settings);
      if (!rec) {
        issues.push(noValidBlankIssue());
        break;
      }
      alloy = rec.alloy;
      assumptions.push({
        code: "ALLOY_RECOMMENDED",
        message: `No material specified — RECOMMENDED ${rec.alloy.code} (${rec.alloy.name}) as the cheapest qualifying alloy. This is a recommendation, not an extraction.`,
      });
      issues.push({
        code: "ALLOY_RECOMMENDED",
        severity: "review",
        message: "Material was not specified; quote uses a recommended alloy and needs review.",
      });
      base.temper = rec.alloy.defaultTemper;
      if (rec.alloy.defaultTemper) {
        assumptions.push(temperDefaulted(rec.alloy));
      }
      break;
    }
    case match.alloyCode === "UNRECOGNIZED":
      issues.push({
        code: "MATERIAL_UNRECOGNIZED",
        severity: "review",
        message: `Material "${ex.material.rawText}" was not recognized — routed to manual review, no automated price.`,
      });
      break;
    case match.alloyCode === "OTHER_METAL":
      issues.push(byRequestIssue(ex.material.rawText ?? "non-aluminum metal"));
      break;
    default: {
      const row = alloyByCode(match.alloyCode)!;
      if (row.status === "by_request") {
        base.alloyCode = row.code;
        issues.push(byRequestIssue(row.name));
        break;
      }
      alloy = row;
      if (match.temper) {
        base.temper = match.temper;
        if (match.temperMapped) {
          assumptions.push({
            code: "TEMPER_DEFAULTED",
            message: `Temper shorthand mapped to stocked default ${match.temper}.`,
          });
        }
      } else if (row.defaultTemper) {
        base.temper = row.defaultTemper;
        assumptions.push(temperDefaulted(row));
      }
      if (ex.material.confidence === "low") {
        assumptions.push({
          code: "LOW_CONFIDENCE_MATERIAL",
          message: `Material "${ex.material.rawText}" matched ${row.code} with low extraction confidence.`,
        });
        issues.push({
          code: "LOW_CONFIDENCE_MATERIAL",
          severity: "review",
          message: "Material was extracted with low confidence — verify before use.",
        });
      }
    }
  }

  // ---- Envelope → blank (§6) and pricing (§7), only for standard alloys.
  if (alloy) {
    base.alloyCode = alloy.code;
    const blankResult = computeBlank(dims, alloy, settings);
    base.orientations = blankResult.candidates;
    if (!blankResult.chosen) {
      if (!issues.some((i) => i.code === "NO_VALID_BLANK")) {
        issues.push(noValidBlankIssue());
      }
    } else {
      const c = blankResult.chosen;
      base.blank = { thicknessIn: c.blankT!, widthIn: c.blankW, lengthIn: c.blankL };

      const pb = selectPriceBookRow(opts.priceBook, alloy.code, quoteDate);
      if (!pb) {
        throw new Error(`no price book row for ${alloy.code} effective ${quoteDate}`);
      }
      base.breakdown = priceQuote({
        blank: { t: c.blankT!, w: c.blankW, l: c.blankL },
        densityLbIn3: alloy.densityLbIn3!,
        basePerLb: pb.basePerLb,
        priceBookId: pb.id,
        qty: base.qty,
        dfars: settings.dfars,
        quoteDate,
      });
    }
  }

  // ---- Status precedence: rejected > needs_review > priced (§5.6).
  if (issues.some((i) => i.severity === "reject")) {
    base.status = "rejected";
    base.breakdown = null; // no price on rejection
  } else if (issues.some((i) => i.severity === "review")) {
    base.status = "needs_review";
  } else {
    base.status = "priced";
  }

  if (base.breakdown) {
    base.totalCents = base.breakdown.orderCents.total;
    if (base.status === "priced") base.shipDate = base.breakdown.leadTime.shipDate;
  }

  return base;
}

function selectPriceBookRow(
  rows: PriceBookRow[],
  alloyCode: string,
  quoteDate: string,
): PriceBookRow | undefined {
  return rows.find(
    (r) =>
      r.alloyCode === alloyCode &&
      r.effectiveDate <= quoteDate &&
      (r.expiresDate == null || quoteDate < r.expiresDate),
  );
}

function temperDefaulted(alloy: AlloyRow): Assumption {
  return {
    code: "TEMPER_DEFAULTED",
    message: `Temper not specified — applied catalog default ${alloy.defaultTemper}.`,
  };
}

function byRequestIssue(materialLabel: string): Issue {
  return {
    code: "BY_REQUEST_MATERIAL",
    severity: "review",
    message: `${materialLabel} is by-request — routed to manual review, no automated price.`,
  };
}

function noValidBlankIssue(): Issue {
  return {
    code: "NO_VALID_BLANK",
    severity: "reject",
    message:
      "No orientation yields a stockable blank (thickness range or 60×144 stock plate limit exceeded).",
  };
}

/** needs_review quotes keep their price unless the material was by-request/unrecognized. */
export function shouldShowPrice(q: AssembledQuote): boolean {
  return q.breakdown !== null && q.status !== "rejected" && q.status !== "extraction_failed";
}

// Re-exported so callers (API route, e2e) don't import extraction internals.
export type { Extraction };
