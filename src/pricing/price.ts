// Deterministic pricing engine (§7). All money in integer cents, half-up
// rounding exactly at the ⚙ steps of §7.1; full float precision between them.
// The only entry point accepts post-Zod, post-normalizer types — this module
// must never import from the Anthropic SDK (acceptance §10.9).
import { ratePerLb, thicknessIndex } from "../rules/catalog";
import { computeLeadTime, addCalendarDays } from "./leadTime";

export interface PriceInput {
  blank: { t: number; w: number; l: number };
  densityLbIn3: number;
  basePerLb: number;
  priceBookId: string;
  qty: number;
  dfars: boolean;
  /** ISO date (YYYY-MM-DD) the quote is issued. */
  quoteDate: string;
}

export interface Breakdown {
  priceBookId: string;
  inputs: {
    blank: { t: number; w: number; l: number };
    densityLbIn3: number;
    qty: number;
    dfars: boolean;
    ratePerLb: number;
    thicknessIndex: number;
  };
  linesCents: {
    material: number;
    dfarsAdder: number;
    cutting: number;
    cuttingPerPiece: number;
    qtyDiscount: number; // positive magnitude; rendered as a negative line
    qtyBreakRate: number;
    setup: number;
    lineSubtotal: number;
    margin: number;
    lineMinAdjustment: number;
    lineTotal: number;
  };
  orderCents: { subtotal: number; orderMinAdjustment: number; total: number };
  weightLb: number;
  leadTime: { days: number; contributors: string[]; shipDate: string };
  validUntil: string;
}

const LINE_MINIMUM_CENTS = 4500;
const ORDER_MINIMUM_CENTS = 12000;
const SETUP_CENTS = 2500;
const MARGIN_RATE = 0.18;
const DFARS_RATE = 0.12;

export function qtyBreakRate(qty: number): number {
  return qty >= 25 ? 0.12 : qty >= 10 ? 0.07 : qty >= 5 ? 0.04 : 0;
}

const roundCentsFromDollars = (d: number) => Math.round(d * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceQuote(input: PriceInput): Breakdown {
  const { blank, densityLbIn3, basePerLb } = input;
  const rate = ratePerLb(basePerLb, blank.t);
  const volumePerPiece = blank.t * blank.w * blank.l;
  const weightLb = round2(volumePerPiece * densityLbIn3 * input.qty); // ⚙ 2 decimals
  const material = roundCentsFromDollars(weightLb * rate); // ⚙ cents
  return priceFromMaterial(input, material, weightLb);
}

/**
 * §7.1 steps downstream of the material line. Split out so nesting (§12) can
 * substitute its yield-based material cost while every later step (DFARS, qty
 * break, setup, margin, minimums, lead time) stays byte-identical to v1.
 */
export function priceFromMaterial(
  input: PriceInput,
  material: number,
  weightLb: number,
): Breakdown {
  const { blank, densityLbIn3, basePerLb, qty, dfars } = input;
  const tIdx = thicknessIndex(blank.t);
  const rate = ratePerLb(basePerLb, blank.t);

  const dfarsAdder = dfars ? Math.round(material * DFARS_RATE) : 0; // ⚙ cents
  const cuttingPerPiece = roundCentsFromDollars(4 * (4.0 + 3.5 * blank.t)); // ⚙ cents, 4 cuts/pc
  const cutting = cuttingPerPiece * qty;
  const breakRate = qtyBreakRate(qty);
  const qtyDiscount = Math.round((material + dfarsAdder + cutting) * breakRate); // ⚙ cents
  const setup = SETUP_CENTS; // v1: one distinct alloy+blankT group per quote
  const lineSubtotal = material + dfarsAdder + cutting - qtyDiscount + setup;
  const margin = Math.round(lineSubtotal * MARGIN_RATE); // ⚙ cents
  let lineTotal = lineSubtotal + margin;
  const lineMinAdjustment = Math.max(0, LINE_MINIMUM_CENTS - lineTotal);
  lineTotal += lineMinAdjustment;

  const subtotal = lineTotal; // v1: exactly one line per quote
  const orderMinAdjustment = Math.max(0, ORDER_MINIMUM_CENTS - subtotal);
  const total = subtotal + orderMinAdjustment;

  const leadTime = computeLeadTime({ blankT: blank.t, maxLineQty: qty, dfars, quoteDate: input.quoteDate });

  return {
    priceBookId: input.priceBookId,
    inputs: { blank, densityLbIn3, qty, dfars, ratePerLb: rate, thicknessIndex: tIdx },
    linesCents: {
      material, dfarsAdder, cutting, cuttingPerPiece,
      qtyDiscount, qtyBreakRate: breakRate, setup,
      lineSubtotal, margin, lineMinAdjustment, lineTotal,
    },
    orderCents: { subtotal, orderMinAdjustment, total },
    weightLb,
    leadTime,
    validUntil: addCalendarDays(input.quoteDate, 14),
  };
}
