import { describe, expect, it } from "vitest";
import { PriceInput, priceQuote } from "../../pricing/price";
import { nestBlanks } from "../nest";
import { priceNested, REMNANT_RATE_FACTOR } from "../price";

// §12 acceptance: a deterministic scenario where nesting against a known
// remnant beats simple pricing by a computable amount. Fixture A's input
// (simple total $292.09 per §7.3) nested onto the seeded 12×24 7075 remnant.
const INPUT_A: PriceInput = {
  blank: { t: 1.25, w: 3.45, l: 7.75 },
  densityLbIn3: 0.1019,
  basePerLb: 6.4,
  priceBookId: "pb_7075_2026-01-01",
  qty: 4,
  dfars: false,
  quoteDate: "2026-01-15",
};

describe("priceNested — remnant scenario beats simple by a computable amount (§12)", () => {
  const simple = priceQuote(INPUT_A);
  const nest = nestBlanks({
    blankWIn: 3.45,
    blankLIn: 7.75,
    qty: 4,
    plates: [{ id: "rem1", widthIn: 12, lengthIn: 24, isRemnant: true }],
  });
  const nested = priceNested({ nest, input: INPUT_A, simpleBreakdown: simple });

  it("hand-recomputes the remnant material line", () => {
    // consumed 119.7375 in² × 1.25 × 0.1019 = 15.251… → ⚙ 15.25 lb
    // rate 6.50 × 0.7 = 4.55 $/lb → 15.25 × 4.55 = 69.3875 → ⚙ $69.39
    expect(nested.materialByPlate).toHaveLength(1);
    const p = nested.materialByPlate[0];
    expect(p.isRemnant).toBe(true);
    expect(p.weightLb).toBe(15.25);
    expect(p.ratePerLb).toBe(4.55);
    expect(p.materialCents).toBe(6939);
  });

  it("flows through §7.1 unchanged: 6939 + 13400 cutting + 2500 setup, 18% margin → $269.50", () => {
    const L = nested.breakdown.linesCents;
    expect(L.material).toBe(6939);
    expect(L.cutting).toBe(13400);
    expect(L.setup).toBe(2500);
    expect(L.lineSubtotal).toBe(22839);
    expect(L.margin).toBe(4111);
    expect(nested.breakdown.orderCents.total).toBe(26950);
  });

  it("beats simple pricing by exactly $22.59", () => {
    expect(simple.orderCents.total).toBe(29209);
    expect(nested.deltaCents).toBe(2259);
  });

  it("reports yield and the remnant factor for the UI", () => {
    expect(nested.yieldPct).toBeCloseTo(106.95 / 119.7375, 9);
    expect(nested.remnantRateFactor).toBe(REMNANT_RATE_FACTOR);
  });
});

describe("priceNested — full sheet at 100% yield equals simple pricing", () => {
  it("delta is exactly zero (full rate, consumed = blank area)", () => {
    const simple = priceQuote(INPUT_A);
    const nest = nestBlanks({
      blankWIn: 3.45,
      blankLIn: 7.75,
      qty: 4,
      plates: [{ id: "sheet1", widthIn: 48, lengthIn: 96, isRemnant: false }],
    });
    const nested = priceNested({ nest, input: INPUT_A, simpleBreakdown: simple });
    expect(nested.materialByPlate[0].materialCents).toBe(simple.linesCents.material);
    expect(nested.breakdown.orderCents.total).toBe(simple.orderCents.total);
    expect(nested.deltaCents).toBe(0);
  });
});

describe("simple pricing stays byte-identical to v1 (§12 acceptance)", () => {
  it("priceQuote with the §7.3 input still produces the frozen v1 breakdown", () => {
    const b = priceQuote(INPUT_A);
    expect(b.weightLb).toBe(13.62);
    expect(b.linesCents).toEqual({
      material: 8853,
      dfarsAdder: 0,
      cutting: 13400,
      cuttingPerPiece: 3350,
      qtyDiscount: 0,
      qtyBreakRate: 0,
      setup: 2500,
      lineSubtotal: 24753,
      margin: 4456,
      lineMinAdjustment: 0,
      lineTotal: 29209,
    });
    expect(b.orderCents).toEqual({ subtotal: 29209, orderMinAdjustment: 0, total: 29209 });
  });
});
