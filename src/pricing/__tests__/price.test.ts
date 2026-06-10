import { describe, expect, it } from "vitest";
import { priceQuote, qtyBreakRate, PriceInput } from "../price";
import { STOCKED_THICKNESSES } from "../../rules/catalog";

// §7.3 fully worked example — fixture T1: 7075-T651, 7.5 × 3.2 × 1.1, qty 4,
// DFARS off → blank 1.25 × 3.45 × 7.75. Asserted to the cent.
const T1: PriceInput = {
  blank: { t: 1.25, w: 3.45, l: 7.75 },
  densityLbIn3: 0.1019,
  basePerLb: 6.4,
  priceBookId: "pb_7075_2026-01-01",
  qty: 4,
  dfars: false,
  quoteDate: "2026-06-09", // a Tuesday
};

describe("priceQuote — §7.3 worked example", () => {
  const b = priceQuote(T1);

  it("weight 13.62 lb", () => expect(b.weightLb).toBe(13.62));
  it("rate $6.50/lb (idx(1.25) = 5)", () => {
    expect(b.inputs.thicknessIndex).toBe(5);
    expect(b.inputs.ratePerLb).toBeCloseTo(6.5, 9);
  });
  // Rounding-order regression: intermediate materialBase asserted in cents.
  it("material $88.53", () => expect(b.linesCents.material).toBe(8853));
  it("DFARS $0.00", () => expect(b.linesCents.dfarsAdder).toBe(0));
  it("cutting $33.50/pc → $134.00", () => {
    expect(b.linesCents.cuttingPerPiece).toBe(3350);
    expect(b.linesCents.cutting).toBe(13400);
  });
  it("no qty break at qty 4", () => {
    expect(b.linesCents.qtyBreakRate).toBe(0);
    expect(b.linesCents.qtyDiscount).toBe(0);
  });
  it("setup $25.00", () => expect(b.linesCents.setup).toBe(2500));
  it("line subtotal $247.53", () => expect(b.linesCents.lineSubtotal).toBe(24753));
  it("margin $44.56", () => expect(b.linesCents.margin).toBe(4456));
  it("line total $292.09", () => expect(b.linesCents.lineTotal).toBe(29209));
  it("order total $292.09, no order minimum", () => {
    expect(b.orderCents.orderMinAdjustment).toBe(0);
    expect(b.orderCents.total).toBe(29209);
  });
  it("lead time 2 business days, validity 14 calendar days", () => {
    expect(b.leadTime.days).toBe(2);
    expect(b.leadTime.shipDate).toBe("2026-06-11");
    expect(b.validUntil).toBe("2026-06-23");
  });
  it("snapshot of the full breakdown", () => expect(b).toMatchSnapshot());
});

describe("qty break boundaries (§7.1 step 8)", () => {
  it.each([
    [4, 0],
    [5, 0.04],
    [9, 0.04],
    [10, 0.07],
    [24, 0.07],
    [25, 0.12],
  ])("qty %i → %f", (qty, rate) => expect(qtyBreakRate(qty)).toBe(rate));

  it("discount applies to material + dfars + cutting", () => {
    const b = priceQuote({ ...T1, qty: 10 });
    const base =
      b.linesCents.material + b.linesCents.dfarsAdder + b.linesCents.cutting;
    expect(b.linesCents.qtyDiscount).toBe(Math.round(base * 0.07));
  });
});

describe("DFARS (+12% on material only)", () => {
  const off = priceQuote(T1);
  const on = priceQuote({ ...T1, dfars: true });

  it("adder is 12% of material, rounded to cents", () => {
    expect(on.linesCents.dfarsAdder).toBe(Math.round(off.linesCents.material * 0.12));
  });
  it("cutting and setup unchanged", () => {
    expect(on.linesCents.cutting).toBe(off.linesCents.cutting);
    expect(on.linesCents.setup).toBe(off.linesCents.setup);
  });
  it("adds 2 lead days", () => expect(on.leadTime.days).toBe(off.leadTime.days + 2));
});

describe("order minimum (§7.1 steps 15–17)", () => {
  it("small job is lifted to $120.00 with a visible adjustment line", () => {
    const b = priceQuote({
      blank: { t: 0.25, w: 1.25, l: 1.25 },
      densityLbIn3: 0.0975,
      basePerLb: 3.45,
      priceBookId: "pb_6061_2026-01-01",
      qty: 1,
      dfars: false,
      quoteDate: "2026-06-09",
    });
    expect(b.orderCents.subtotal).toBeLessThan(12000);
    expect(b.orderCents.orderMinAdjustment).toBe(12000 - b.orderCents.subtotal);
    expect(b.orderCents.total).toBe(12000);
  });
});

// Acceptance §10.8: breakdown internally consistent to the cent for randomized
// valid inputs — every displayed figure recomputable from displayed inputs.
describe("hand-recomputability property", () => {
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("200 randomized inputs are internally consistent", () => {
    const rnd = mulberry32(20260609);
    for (let i = 0; i < 200; i++) {
      const t = STOCKED_THICKNESSES[Math.floor(rnd() * STOCKED_THICKNESSES.length)];
      const input: PriceInput = {
        blank: { t, w: 1 + rnd() * 59, l: 1 + rnd() * 143 },
        densityLbIn3: 0.09 + rnd() * 0.02,
        basePerLb: 3 + rnd() * 6,
        priceBookId: "pb_test",
        qty: 1 + Math.floor(rnd() * 40),
        dfars: rnd() < 0.5,
        quoteDate: "2026-06-09",
      };
      const b = priceQuote(input);
      const L = b.linesCents;

      // every figure derivable from displayed weight, $/lb, and formulas
      expect(b.weightLb).toBe(
        Math.round(input.blank.t * input.blank.w * input.blank.l * input.densityLbIn3 * input.qty * 100) / 100,
      );
      expect(L.material).toBe(Math.round(b.weightLb * b.inputs.ratePerLb * 100));
      expect(L.dfarsAdder).toBe(input.dfars ? Math.round(L.material * 0.12) : 0);
      expect(L.cuttingPerPiece).toBe(Math.round(4 * (4 + 3.5 * t) * 100));
      expect(L.cutting).toBe(L.cuttingPerPiece * input.qty);
      expect(L.qtyDiscount).toBe(
        Math.round((L.material + L.dfarsAdder + L.cutting) * L.qtyBreakRate),
      );
      expect(L.lineSubtotal).toBe(
        L.material + L.dfarsAdder + L.cutting - L.qtyDiscount + L.setup,
      );
      expect(L.margin).toBe(Math.round(L.lineSubtotal * 0.18));
      expect(L.lineTotal).toBe(L.lineSubtotal + L.margin + L.lineMinAdjustment);
      expect(L.lineTotal).toBeGreaterThanOrEqual(4500);
      expect(b.orderCents.total).toBe(b.orderCents.subtotal + b.orderCents.orderMinAdjustment);
      expect(b.orderCents.total).toBeGreaterThanOrEqual(12000 > b.orderCents.subtotal ? 12000 : b.orderCents.subtotal);
      for (const v of Object.values(L)) expect(Number.isFinite(v)).toBe(true);
      // all money values are integer cents
      for (const [k, v] of Object.entries(L)) {
        if (k !== "qtyBreakRate") expect(Number.isInteger(v), `${k} integer`).toBe(true);
      }
    }
  });
});
