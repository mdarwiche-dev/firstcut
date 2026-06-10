// Deterministic material normalizer (§5.5). Pure function; no LLM.
// Matches verbatim extracted material text against an explicit pattern table.

export interface MaterialMatch {
  /** Catalog alloy code, or OTHER_METAL | UNRECOGNIZED | UNSPECIFIED */
  alloyCode: string;
  temper: string | null;
  /** True when a shorthand temper was mapped (6061-T6 → T651); assumption recorded downstream. */
  temperMapped: boolean;
}

interface PatternRow {
  pattern: RegExp;
  alloyCode: string;
  temper: string | null;
  temperMapped?: boolean;
}

// Ordered most-specific-first (implements "longest match wins").
const TABLE: PatternRow[] = [
  { pattern: /7075[- ]?T651\b/i, alloyCode: "7075", temper: "T651" },
  { pattern: /7075[- ]?T7351\b/i, alloyCode: "7075", temper: "T7351" },
  { pattern: /6061[- ]?T6511\b/i, alloyCode: "6061", temper: "T6511" },
  { pattern: /6061[- ]?T651\b/i, alloyCode: "6061", temper: "T651" },
  { pattern: /6061[- ]?T6\b/i, alloyCode: "6061", temper: "T651", temperMapped: true },
  { pattern: /7050[- ]?T7451\b/i, alloyCode: "7050", temper: "T7451" },
  { pattern: /7050[- ]?T7651\b/i, alloyCode: "7050", temper: "T7651" },
  // Marine-series stocked tempers, so explicit specs (and the STEP form
  // round-trip) preserve the temper instead of falling to the bare-alloy rows.
  { pattern: /5052[- ]?H32\b/i, alloyCode: "5052", temper: "H32" },
  { pattern: /5083[- ]?H116\b/i, alloyCode: "5083", temper: "H116" },
  { pattern: /5086[- ]?H116\b/i, alloyCode: "5086", temper: "H116" },
  // Stainless before generic STEEL so "316 STAINLESS STEEL" → SS_316.
  { pattern: /(304\s*(SS|STAINLESS)|(SS|STAINLESS)[^0-9]*304)/i, alloyCode: "SS_304", temper: null },
  { pattern: /(316\s*(SS|STAINLESS)|(SS|STAINLESS)[^0-9]*316)/i, alloyCode: "SS_316", temper: null },
  { pattern: /(17[- ]?4\s?PH.*(SS|STAINLESS)|(SS|STAINLESS).*17[- ]?4\s?PH|17[- ]?4\s?PH)/i, alloyCode: "SS_17_4PH", temper: null },
  { pattern: /INCONEL\s?625|625.*INCONEL|INCONEL.*625/i, alloyCode: "INCONEL_625", temper: null },
  { pattern: /INCONEL\s?718|718.*INCONEL|INCONEL.*718/i, alloyCode: "INCONEL_718", temper: null },
  { pattern: /ATP[- ]?5|CAST\s?(TOOL|T\s?&\s?J)|JIG\s?PLATE|MIC[- ]?6/i, alloyCode: "CAST_TJ", temper: null },
  { pattern: /7075\b/i, alloyCode: "7075", temper: null },
  { pattern: /6061\b/i, alloyCode: "6061", temper: null },
  { pattern: /7050\b/i, alloyCode: "7050", temper: null },
  { pattern: /5052\b/i, alloyCode: "5052", temper: null },
  { pattern: /5083\b/i, alloyCode: "5083", temper: null },
  { pattern: /5086\b/i, alloyCode: "5086", temper: null },
  { pattern: /TI[- ]?6AL[- ]?4V|TITANIUM|\bSTEEL\b|\b4140\b|\bA36\b|STAINLESS/i, alloyCode: "OTHER_METAL", temper: null },
];

export function normalizeMaterial(rawText: string | null): MaterialMatch {
  if (rawText == null || rawText.trim() === "") {
    return { alloyCode: "UNSPECIFIED", temper: null, temperMapped: false };
  }
  const text = rawText.toUpperCase().replace(/\s+/g, " ").trim();
  for (const row of TABLE) {
    if (row.pattern.test(text)) {
      return {
        alloyCode: row.alloyCode,
        temper: row.temper,
        temperMapped: row.temperMapped ?? false,
      };
    }
  }
  return { alloyCode: "UNRECOGNIZED", temper: null, temperMapped: false };
}
