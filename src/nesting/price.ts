// Stretch §12: yield-based nested pricing. Pure — no DB, no Anthropic SDK.
//
// nestedMaterialCost = consumedArea × blankT × density × ratePerLb, per plate,
// with remnant-sourced material charged at REMNANT_RATE_FACTOR × ratePerLb.
//
// FINDING (documented in PRD): under §12's literal cost model, consumed area
// is ≥ total blank area by construction (yield ≤ 100%), so nested material
// could only ever equal simple pricing at a perfect tile and exceeds it
// otherwise — the acceptance scenario "nesting against a known remnant beats
// simple pricing" would be unsatisfiable. The remnant rate factor below is
// the minimal addition that makes it satisfiable: remnants are sunk salvage
// inventory priced to move. Invented demo data, like every other rate here.
import { ratePerLb } from "../rules/catalog";
import { Breakdown, PriceInput, priceFromMaterial } from "../pricing/price";
import { NestResult } from "./nest";

export const REMNANT_RATE_FACTOR = 0.7;

export interface PlateMaterialLine {
  plateId: string;
  isRemnant: boolean;
  plateWIn: number;
  plateLIn: number;
  consumedAreaIn2: number;
  weightLb: number; // ⚙ 2 decimals, per plate
  ratePerLb: number; // full rate × (0.7 if remnant)
  materialCents: number; // ⚙ cents, per plate
}

/** What persists to quote_lines.nesting_json and renders in the UI panel. */
export interface NestingRecord {
  nest: NestResult;
  pricing: NestedPricing;
}

export interface NestedPricing {
  breakdown: Breakdown;
  materialByPlate: PlateMaterialLine[];
  totalConsumedAreaIn2: number;
  totalBlankAreaIn2: number;
  yieldPct: number;
  remnantRateFactor: number;
  /** simple total − nested total; positive means nesting is cheaper. */
  deltaCents: number;
}

export function priceNested(opts: {
  nest: NestResult;
  input: PriceInput;
  simpleBreakdown: Breakdown;
}): NestedPricing {
  const { nest, input, simpleBreakdown } = opts;
  const { blank, densityLbIn3, basePerLb } = input;
  const fullRate = ratePerLb(basePerLb, blank.t);

  // Per-plate ⚙ rounding so each displayed line recomputes by hand and the
  // material total is exactly the sum of the lines.
  const materialByPlate: PlateMaterialLine[] = nest.usages.map((u) => {
    const rate = u.plate.isRemnant ? round2(fullRate * REMNANT_RATE_FACTOR) : fullRate;
    const weightLb = round2(u.consumedAreaIn2 * blank.t * densityLbIn3); // ⚙
    return {
      plateId: u.plate.id,
      isRemnant: u.plate.isRemnant,
      plateWIn: u.plate.widthIn,
      plateLIn: u.plate.lengthIn,
      consumedAreaIn2: u.consumedAreaIn2,
      weightLb,
      ratePerLb: rate,
      materialCents: Math.round(weightLb * rate * 100), // ⚙
    };
  });

  const materialCents = materialByPlate.reduce((s, p) => s + p.materialCents, 0);
  const weightLb = round2(materialByPlate.reduce((s, p) => s + p.weightLb, 0));
  const breakdown = priceFromMaterial(input, materialCents, weightLb);

  return {
    breakdown,
    materialByPlate,
    totalConsumedAreaIn2: nest.totalConsumedAreaIn2,
    totalBlankAreaIn2: nest.totalBlankAreaIn2,
    yieldPct: nest.yieldPct,
    remnantRateFactor: REMNANT_RATE_FACTOR,
    deltaCents: simpleBreakdown.orderCents.total - breakdown.orderCents.total,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
