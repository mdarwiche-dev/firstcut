// Catalog constants — single source of truth for both the seed script and the
// pure rules/pricing functions (which take these rows as inputs; no DB access).
// Alloy list, tempers, thickness ranges, densities, plate sizes, and thickness
// increments are grounded in Nox Metals' public materials page. Prices are invented.

export interface AlloyRow {
  code: string;
  name: string;
  family: "aluminum" | "nickel" | "stainless";
  status: "standard" | "by_request";
  densityLbIn3: number | null;
  minThicknessIn: number | null;
  maxThicknessIn: number | null;
  tempers: string[];
  defaultTemper: string | null;
  dfarsAvailable: boolean;
}

// Global stocked thickness increments (grounded). Index = thicknessIndex used in pricing.
export const STOCKED_THICKNESSES = [
  0.25, 0.375, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10,
] as const;

export function thicknessIndex(t: number): number {
  const i = STOCKED_THICKNESSES.indexOf(t as (typeof STOCKED_THICKNESSES)[number]);
  if (i === -1) throw new Error(`thickness ${t} is not a stocked increment`);
  return i;
}

// Stock plate sizes (grounded). A blank is rejectable if no orientation fits 60" × 144".
export const STOCK_PLATE_SIZES = [
  { w: 48, l: 96 },
  { w: 48, l: 144 },
  { w: 60, l: 96 },
  { w: 60, l: 144 },
] as const;
export const MAX_STOCK_WIDTH_IN = 60;
export const MAX_STOCK_LENGTH_IN = 144;

// Marine-series (5052/5083/5086) are listed to 40" but stocked increments cap
// the effective max at 10" — we store the effective cap since the snap search
// only ever considers stocked increments.
export const ALLOYS: AlloyRow[] = [
  { code: "6061", name: "6061 Aluminum Plate", family: "aluminum", status: "standard", densityLbIn3: 0.0975, minThicknessIn: 0.25, maxThicknessIn: 10, tempers: ["T651", "T6511"], defaultTemper: "T651", dfarsAvailable: true },
  { code: "7075", name: "7075 Aluminum Plate", family: "aluminum", status: "standard", densityLbIn3: 0.1019, minThicknessIn: 0.25, maxThicknessIn: 6, tempers: ["T651", "T7351"], defaultTemper: "T651", dfarsAvailable: true },
  { code: "7050", name: "7050 Aluminum Plate", family: "aluminum", status: "standard", densityLbIn3: 0.1020, minThicknessIn: 0.25, maxThicknessIn: 6, tempers: ["T7451", "T7651"], defaultTemper: "T7451", dfarsAvailable: true },
  { code: "5052", name: "5052 Aluminum Plate", family: "aluminum", status: "standard", densityLbIn3: 0.0968, minThicknessIn: 0.25, maxThicknessIn: 10, tempers: ["H32"], defaultTemper: "H32", dfarsAvailable: true },
  { code: "5083", name: "5083 Aluminum Plate", family: "aluminum", status: "standard", densityLbIn3: 0.0961, minThicknessIn: 0.25, maxThicknessIn: 10, tempers: ["H116"], defaultTemper: "H116", dfarsAvailable: true },
  { code: "5086", name: "5086 Aluminum Plate", family: "aluminum", status: "standard", densityLbIn3: 0.0958, minThicknessIn: 0.25, maxThicknessIn: 10, tempers: ["H116"], defaultTemper: "H116", dfarsAvailable: true },
  { code: "CAST_TJ", name: "Cast Tool & Jig Plate (ATP-5 type)", family: "aluminum", status: "standard", densityLbIn3: 0.0960, minThicknessIn: 0.25, maxThicknessIn: 4, tempers: [], defaultTemper: null, dfarsAvailable: true },
  { code: "INCONEL_625", name: "Inconel 625", family: "nickel", status: "by_request", densityLbIn3: null, minThicknessIn: null, maxThicknessIn: null, tempers: [], defaultTemper: null, dfarsAvailable: false },
  { code: "INCONEL_718", name: "Inconel 718", family: "nickel", status: "by_request", densityLbIn3: null, minThicknessIn: null, maxThicknessIn: null, tempers: [], defaultTemper: null, dfarsAvailable: false },
  { code: "SS_304", name: "304 Stainless Steel", family: "stainless", status: "by_request", densityLbIn3: null, minThicknessIn: null, maxThicknessIn: null, tempers: [], defaultTemper: null, dfarsAvailable: false },
  { code: "SS_316", name: "316 Stainless Steel", family: "stainless", status: "by_request", densityLbIn3: null, minThicknessIn: null, maxThicknessIn: null, tempers: [], defaultTemper: null, dfarsAvailable: false },
  { code: "SS_17_4PH", name: "17-4 PH Stainless Steel", family: "stainless", status: "by_request", densityLbIn3: null, minThicknessIn: null, maxThicknessIn: null, tempers: [], defaultTemper: null, dfarsAvailable: false },
];

export function alloyByCode(code: string): AlloyRow | undefined {
  return ALLOYS.find((a) => a.code === code);
}

// Invented base $/lb (§4.3). ratePerLb(alloy, t) = basePerLb + 0.02 × thicknessIndex(t)
export const BASE_PER_LB: Record<string, number> = {
  "6061": 3.45,
  "5052": 3.90,
  "5086": 3.90,
  "5083": 4.10,
  CAST_TJ: 4.60,
  "7075": 6.40,
  "7050": 8.10,
};

export function ratePerLb(basePerLb: number, blankT: number): number {
  return basePerLb + 0.02 * thicknessIndex(blankT);
}

/** Stocked thicknesses available to an alloy: global increments within its [min, max]. */
export function stockedThicknessesFor(alloy: AlloyRow): number[] {
  if (alloy.minThicknessIn == null || alloy.maxThicknessIn == null) return [];
  return STOCKED_THICKNESSES.filter(
    (t) => t >= alloy.minThicknessIn! && t <= alloy.maxThicknessIn!,
  );
}
