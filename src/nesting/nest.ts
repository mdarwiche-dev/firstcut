// Stretch §12: shelf-based first-fit-decreasing guillotine nesting. Pure —
// plates are passed in, nothing here touches the DB or the Anthropic SDK.
//
// v1 quotes carry exactly one line (qty N of one blank size), so the input is
// a single rectangle + qty rather than a mixed list; "sort blanks descending
// by area" from §12 is trivially satisfied.
//
// Geometry conventions: a plate is widthIn (x, across) × lengthIn (y, along).
// Shelves are full-width strips severed edge-to-edge (guillotine) stacked
// along y; blanks sit side by side along x within a shelf and may rotate 90°.
//
// Consumed-area accounting (drives nested material cost, §12):
//   - every shelf strip W×h is severed for this job and charged;
//   - a within-shelf tail (W − used) × h that is ≥ minRemnant on both sides is
//     returned to inventory and credited (subtracted from consumed); smaller
//     tails are scrap and stay charged;
//   - the un-severed plate tail W × (L − Σh) is returned if ≥ minRemnant on
//     both sides; if it is too small to stock, the job effectively used up the
//     plate, so it is charged as scrap.

export interface PlateInput {
  id: string;
  widthIn: number;
  lengthIn: number;
  isRemnant: boolean;
}

export interface NestSettings {
  /** Off-cuts must be at least this on both sides to return to inventory. */
  minRemnantIn: number;
}

export const DEFAULT_NEST_SETTINGS: NestSettings = { minRemnantIn: 6 };

export interface Placement {
  /** Lower-left corner, inches from the plate's lower-left. */
  xIn: number;
  yIn: number;
  wIn: number; // extent along x (plate width)
  lIn: number; // extent along y (plate length)
  rotated: boolean;
}

export interface ReturnedOffcut {
  xIn: number;
  yIn: number;
  widthIn: number; // along x
  lengthIn: number; // along y
  areaIn2: number;
  kind: "shelf_tail" | "plate_tail";
}

export interface Shelf {
  yIn: number;
  heightIn: number;
}

export interface PlateUsage {
  plate: PlateInput;
  shelves: Shelf[];
  placements: Placement[];
  /** Σ severed shelf strips (W × h). */
  stripAreaIn2: number;
  returnedOffcuts: ReturnedOffcut[];
  /** stripArea − returned shelf tails + (plate tail when too small to return). */
  consumedAreaIn2: number;
}

export interface NestResult {
  ok: boolean;
  placedQty: number;
  unplacedQty: number;
  blank: { wIn: number; lIn: number };
  usages: PlateUsage[];
  totalBlankAreaIn2: number;
  totalConsumedAreaIn2: number;
  /** blank area ÷ net consumed area; ≤ 1 by construction. */
  yieldPct: number;
}

const EPS = 1e-9;

export function nestBlanks(opts: {
  blankWIn: number;
  blankLIn: number;
  qty: number;
  plates: PlateInput[];
  settings?: Partial<NestSettings>;
}): NestResult {
  const settings = { ...DEFAULT_NEST_SETTINGS, ...opts.settings };
  const blank = { wIn: opts.blankWIn, lIn: opts.blankLIn };
  const blankArea = blank.wIn * blank.lIn;

  // §12 plate preference: remnants before full sheets, smaller before larger;
  // id as the final tie-break so the search is fully deterministic.
  const plates = [...opts.plates].sort(
    (a, b) =>
      Number(b.isRemnant) - Number(a.isRemnant) ||
      a.widthIn * a.lengthIn - b.widthIn * b.lengthIn ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  let qtyLeft = opts.qty;
  const usages: PlateUsage[] = [];

  for (const plate of plates) {
    if (qtyLeft <= 0) break;
    const usage = packPlate(plate, blank, qtyLeft, settings);
    if (!usage) continue; // plate fits zero blanks — leave it untouched
    qtyLeft -= usage.placements.length;
    usages.push(usage);
  }

  const placedQty = opts.qty - qtyLeft;
  const totalConsumed = usages.reduce((s, u) => s + u.consumedAreaIn2, 0);
  const totalBlankArea = blankArea * placedQty;
  return {
    ok: qtyLeft === 0,
    placedQty,
    unplacedQty: qtyLeft,
    blank,
    usages,
    totalBlankAreaIn2: totalBlankArea,
    totalConsumedAreaIn2: totalConsumed,
    yieldPct: totalConsumed > 0 ? totalBlankArea / totalConsumed : 0,
  };
}

/** Fill one plate with as many blanks as fit; null if none fit. */
function packPlate(
  plate: PlateInput,
  blank: { wIn: number; lIn: number },
  qtyWanted: number,
  settings: NestSettings,
): PlateUsage | null {
  const W = plate.widthIn;
  const L = plate.lengthIn;
  const min = settings.minRemnantIn;

  const shelves: Shelf[] = [];
  const placements: Placement[] = [];
  const returnedOffcuts: ReturnedOffcut[] = [];
  let stripArea = 0;
  let consumed = 0;
  let yCursor = 0;
  let qtyLeft = qtyWanted;

  while (qtyLeft > 0) {
    // Open a new shelf. With identical blanks a shelf is filled the moment it
    // opens, so orientation choice = pick the strip layout with the lowest
    // consumed area per blank (full strip minus the tail if it's returnable).
    type Cand = {
      across: number;
      height: number;
      rotated: boolean;
      n: number;
      consumed: number;
      tailReturnable: boolean;
    };
    const candidates: Cand[] = [];
    for (const [across, height, rotated] of [
      [blank.wIn, blank.lIn, false],
      [blank.lIn, blank.wIn, true],
    ] as const) {
      if (across > W + EPS || height > L - yCursor + EPS) continue;
      const n = Math.min(qtyLeft, Math.floor((W + EPS) / across));
      if (n < 1) continue;
      const tailW = W - n * across;
      const tailReturnable = tailW >= min - EPS && height >= min - EPS;
      const strip = W * height;
      candidates.push({
        across,
        height,
        rotated,
        n,
        consumed: strip - (tailReturnable ? tailW * height : 0),
        tailReturnable,
      });
    }
    if (candidates.length === 0) break;
    candidates.sort(
      (a, b) =>
        a.consumed / a.n - b.consumed / b.n ||
        a.height - b.height ||
        Number(a.rotated) - Number(b.rotated),
    );
    const c = candidates[0];

    shelves.push({ yIn: yCursor, heightIn: c.height });
    for (let i = 0; i < c.n; i++) {
      placements.push({
        xIn: i * c.across,
        yIn: yCursor,
        wIn: c.across,
        lIn: c.height,
        rotated: c.rotated,
      });
    }
    stripArea += W * c.height;
    consumed += c.consumed;
    if (c.tailReturnable) {
      const tailW = W - c.n * c.across;
      returnedOffcuts.push({
        xIn: c.n * c.across,
        yIn: yCursor,
        widthIn: tailW,
        lengthIn: c.height,
        areaIn2: tailW * c.height,
        kind: "shelf_tail",
      });
    }
    yCursor += c.height;
    qtyLeft -= c.n;
  }

  if (placements.length === 0) return null;

  // Plate tail beyond the last guillotine cut.
  const tailL = L - yCursor;
  if (tailL > EPS) {
    if (tailL >= settings.minRemnantIn - EPS && W >= settings.minRemnantIn - EPS) {
      returnedOffcuts.push({
        xIn: 0,
        yIn: yCursor,
        widthIn: W,
        lengthIn: tailL,
        areaIn2: W * tailL,
        kind: "plate_tail",
      });
    } else {
      consumed += W * tailL; // unusable tail — the job is charged for it
    }
  }

  return {
    plate,
    shelves,
    placements,
    stripAreaIn2: stripArea,
    returnedOffcuts,
    consumedAreaIn2: consumed,
  };
}
