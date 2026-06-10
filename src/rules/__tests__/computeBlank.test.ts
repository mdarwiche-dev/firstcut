import { describe, expect, it } from "vitest";
import { alloyByCode } from "../catalog";
import {
  computeBlank,
  DEFAULT_SETTINGS,
  recommendCheapestAlloy,
  snapThickness,
} from "../computeBlank";

const al6061 = alloyByCode("6061")!;
const al7075 = alloyByCode("7075")!;
const castTj = alloyByCode("CAST_TJ")!;

describe("computeBlank — §6.3 worked example (clean)", () => {
  // Part: 6061, 11.5 × 5.0 × 0.9, defaults.
  const result = computeBlank([11.5, 5.0, 0.9], al6061, DEFAULT_SETTINGS);

  it("chooses blank 1.0 × 5.25 × 11.75, volume 61.6875 in³", () => {
    const chosen = result.chosen!;
    expect(chosen.blankT).toBe(1.0); // requiredT 1.0 snaps exactly to stocked 1.0
    expect(chosen.blankW).toBeCloseTo(5.25, 9);
    expect(chosen.blankL).toBeCloseTo(11.75, 9);
    expect(chosen.volumeIn3).toBeCloseTo(61.6875, 9);
    expect(chosen.tAxisDim).toBe(0.9);
  });

  it("t-axis 5.0 alternative snaps to 6.0 with volume 81.075", () => {
    const alt = result.candidates.find((c) => c.tAxisDim === 5.0)!;
    expect(alt.blankT).toBe(6.0);
    expect(alt.volumeIn3).toBeCloseTo(81.075, 9);
    expect(alt.valid).toBe(true);
    expect(alt.chosen).toBe(false);
  });

  it("t-axis 11.5 is invalid (required 11.6 > 6061 max 10)", () => {
    const alt = result.candidates.find((c) => c.tAxisDim === 11.5)!;
    expect(alt.valid).toBe(false);
    expect(alt.blankT).toBeNull();
    expect(alt.reason).toMatch(/no stocked thickness/);
  });
});

describe("computeBlank — §6.4 worked example (non-obvious orientation)", () => {
  // Part: 6061-T651, 4.0 × 3.8 × 3.6. Exact table from the PRD.
  const result = computeBlank([4.0, 3.8, 3.6], al6061, DEFAULT_SETTINGS);
  const byTAxis = (t: number) => result.candidates.find((c) => c.tAxisDim === t)!;

  it("t-axis 3.6: snap 4.0, blank 4.0 × 4.05 × 4.25, volume 68.85", () => {
    const c = byTAxis(3.6);
    expect(c.blankT).toBe(4.0);
    expect(c.blankW).toBeCloseTo(4.05, 9);
    expect(c.blankL).toBeCloseTo(4.25, 9);
    expect(c.volumeIn3).toBeCloseTo(68.85, 9);
    expect(c.chosen).toBe(false);
  });

  it("t-axis 3.8 wins: snap 4.0, blank 4.0 × 3.85 × 4.25, volume 65.45", () => {
    const c = byTAxis(3.8);
    expect(c.blankT).toBe(4.0);
    expect(c.blankW).toBeCloseTo(3.85, 9);
    expect(c.blankL).toBeCloseTo(4.25, 9);
    expect(c.volumeIn3).toBeCloseTo(65.45, 9);
    expect(c.chosen).toBe(true);
    expect(result.chosen).toBe(c);
  });

  it("t-axis 4.0: snap 5.0, blank 5.0 × 3.85 × 4.05, volume 77.9625", () => {
    const c = byTAxis(4.0);
    expect(c.blankT).toBe(5.0);
    expect(c.blankW).toBeCloseTo(3.85, 9);
    expect(c.blankL).toBeCloseTo(4.05, 9);
    expect(c.volumeIn3).toBeCloseTo(77.9625, 9);
    expect(c.chosen).toBe(false);
  });
});

describe("snapThickness edge cases", () => {
  it("requiredT exactly equal to a stocked value snaps to it", () => {
    expect(snapThickness(1.0, al6061)).toBe(1.0);
    expect(snapThickness(0.25, al6061)).toBe(0.25);
  });

  it("float noise (0.9 + 0.1) still snaps to 1.0, not 1.25", () => {
    expect(snapThickness(0.9 + 0.1, al6061)).toBe(1.0);
  });

  it("above alloy max returns null (7075 capped at 6)", () => {
    expect(snapThickness(6.1, al7075)).toBeNull();
    expect(snapThickness(6.0, al7075)).toBe(6.0);
  });

  it("CAST_TJ capped at 4", () => {
    expect(snapThickness(4.05, castTj)).toBeNull();
    expect(snapThickness(3.9, castTj)).toBe(4.0);
  });
});

describe("computeBlank — allowance overrides", () => {
  it("custom side allowance and cleanup are applied", () => {
    const r = computeBlank([10, 4, 1], al6061, {
      sideAllowanceIn: 0.25,
      minThicknessCleanupIn: 0.3,
    });
    const chosen = r.chosen!;
    expect(chosen.blankT).toBe(1.5); // 1 + 0.3 = 1.3 → snap 1.5
    expect(chosen.blankW).toBeCloseTo(4.5, 9); // 4 + 2×0.25
    expect(chosen.blankL).toBeCloseTo(10.5, 9);
  });
});

describe("computeBlank — rejection (fixture D shape)", () => {
  it("150 × 20 × 1 in 6061 has no valid orientation", () => {
    const r = computeBlank([150, 20, 1], al6061, DEFAULT_SETTINGS);
    expect(r.chosen).toBeNull();
    expect(r.candidates).toHaveLength(3);
    for (const c of r.candidates) expect(c.valid).toBe(false);
    const stockReject = r.candidates.find((c) => c.tAxisDim === 1)!;
    expect(stockReject.reason).toMatch(/exceeds largest stock plate 60×144/);
  });
});

describe("recommendCheapestAlloy (§5.5 UNSPECIFIED)", () => {
  it("recommends 6061 (lowest rate) for a typical part, deterministically", () => {
    const a = recommendCheapestAlloy([7.5, 3.2, 1.1]);
    const b = recommendCheapestAlloy([7.5, 3.2, 1.1]);
    expect(a!.alloy.code).toBe("6061");
    expect(b!.alloy.code).toBe("6061");
    expect(a!.blank.chosen!.blankT).toBe(b!.blank.chosen!.blankT);
  });

  it("returns null when nothing qualifies", () => {
    expect(recommendCheapestAlloy([200, 100, 50])).toBeNull();
  });
});
