// Envelope → blank rules layer (§6). Pure, synchronous, no DB or network access.
import {
  AlloyRow,
  ALLOYS,
  BASE_PER_LB,
  MAX_STOCK_LENGTH_IN,
  MAX_STOCK_WIDTH_IN,
  ratePerLb,
  stockedThicknessesFor,
} from "./catalog";

export interface BlankSettings {
  /** Machining allowance per side on the two plan dimensions. Default 0.125. */
  sideAllowanceIn: number;
  /** Minimum total cleanup stock on thickness. Default 0.1. */
  minThicknessCleanupIn: number;
}

export const DEFAULT_SETTINGS: BlankSettings = {
  sideAllowanceIn: 0.125,
  minThicknessCleanupIn: 0.1,
};

export interface OrientationCandidate {
  /** The part dimension assigned to the thickness axis for this candidate. */
  tAxisDim: number;
  planDims: [number, number];
  requiredT: number;
  blankT: number | null;
  blankW: number;
  blankL: number;
  volumeIn3: number | null;
  valid: boolean;
  reason: string | null; // invalidity reason, or the choice reason on the chosen row
  chosen: boolean;
}

export interface BlankResult {
  candidates: OrientationCandidate[];
  chosen: OrientationCandidate | null; // null → NO_VALID_BLANK (reject)
}

const EPS = 1e-9; // float guard: 3.6 + 0.1 must snap to a stocked 3.7-covering increment, not miss 4.0-vs-3.7000000001 noise

/** Smallest stocked thickness ≥ requiredT within the alloy's range, or null. */
export function snapThickness(requiredT: number, alloy: AlloyRow): number | null {
  for (const t of stockedThicknessesFor(alloy)) {
    if (t >= requiredT - EPS) return t;
  }
  return null;
}

/**
 * 3-axis orientation search (§6.2). The envelope is an unordered triple; each
 * dimension takes a turn as the thickness axis. Chosen = lowest volume
 * (faithful cost proxy: rate varies only with thickness, which the search
 * already captures). Tie-breaks: lower blankT, then lower blankL.
 */
export function computeBlank(
  envelope: [number, number, number],
  alloy: AlloyRow,
  settings: BlankSettings = DEFAULT_SETTINGS,
): BlankResult {
  const candidates: OrientationCandidate[] = envelope.map((tDim, i) => {
    const planDims = envelope.filter((_, j) => j !== i) as [number, number];
    const requiredT = tDim + settings.minThicknessCleanupIn;
    const blankT = snapThickness(requiredT, alloy);
    const blankW = Math.min(...planDims) + 2 * settings.sideAllowanceIn;
    const blankL = Math.max(...planDims) + 2 * settings.sideAllowanceIn;

    let valid = true;
    let reason: string | null = null;
    if (blankT === null) {
      valid = false;
      reason = `no stocked thickness covers required ${round3(requiredT)}" within ${alloy.code} range`;
    } else if (blankW > MAX_STOCK_WIDTH_IN + EPS || blankL > MAX_STOCK_LENGTH_IN + EPS) {
      valid = false;
      reason = `exceeds largest stock plate ${MAX_STOCK_WIDTH_IN}×${MAX_STOCK_LENGTH_IN}`;
    }
    const volumeIn3 = valid && blankT !== null ? blankT * blankW * blankL : null;
    return { tAxisDim: tDim, planDims, requiredT, blankT, blankW, blankL, volumeIn3, valid, reason, chosen: false };
  });

  const valid = candidates.filter((c) => c.valid);
  if (valid.length === 0) return { candidates, chosen: null };

  valid.sort(
    (a, b) =>
      a.volumeIn3! - b.volumeIn3! || a.blankT! - b.blankT! || a.blankL - b.blankL,
  );
  const chosen = valid[0];
  chosen.chosen = true;
  chosen.reason = `lowest blank volume ${round3(chosen.volumeIn3!)} in³ among ${valid.length} valid orientation${valid.length > 1 ? "s" : ""}`;
  return { candidates, chosen };
}

/**
 * Cheapest qualifying alloy recommendation (§5.5, UNSPECIFIED material).
 * Among standard alloys with a valid orientation for this envelope, pick the
 * lowest ratePerLb at the chosen blank thickness; ties → lower density.
 */
export function recommendCheapestAlloy(
  envelope: [number, number, number],
  settings: BlankSettings = DEFAULT_SETTINGS,
): { alloy: AlloyRow; blank: BlankResult } | null {
  const qualifying = ALLOYS.filter((a) => a.status === "standard")
    .map((alloy) => ({ alloy, blank: computeBlank(envelope, alloy, settings) }))
    .filter((q) => q.blank.chosen !== null);
  if (qualifying.length === 0) return null;

  qualifying.sort((a, b) => {
    const rateA = ratePerLb(BASE_PER_LB[a.alloy.code], a.blank.chosen!.blankT!);
    const rateB = ratePerLb(BASE_PER_LB[b.alloy.code], b.blank.chosen!.blankT!);
    return rateA - rateB || a.alloy.densityLbIn3! - b.alloy.densityLbIn3!;
  });
  return qualifying[0];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
