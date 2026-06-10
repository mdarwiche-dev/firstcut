import { describe, expect, it } from "vitest";
import { nestBlanks, PlateInput } from "../nest";

// The seeded §12 scenario: fixture A's blank (7075, 1.25 × 3.45 × 7.75, qty 4)
// against the seeded 12×24 remnant. All numbers below recompute by hand.
const BLANK_A = { blankWIn: 3.45, blankLIn: 7.75, qty: 4 };
const REMNANT_12x24: PlateInput = { id: "rem1", widthIn: 12, lengthIn: 24, isRemnant: true };
const SHEET_48x96: PlateInput = { id: "sheet1", widthIn: 48, lengthIn: 96, isRemnant: false };

describe("nestBlanks — seeded remnant scenario (§12)", () => {
  it("packs 4 blanks onto the 12×24 remnant: 3 across one shelf + 1 on a second", () => {
    const r = nestBlanks({ ...BLANK_A, plates: [REMNANT_12x24] });
    expect(r.ok).toBe(true);
    expect(r.placedQty).toBe(4);
    expect(r.usages).toHaveLength(1);
    const u = r.usages[0];
    expect(u.shelves).toEqual([
      { yIn: 0, heightIn: 7.75 },
      { yIn: 7.75, heightIn: 7.75 },
    ]);
    expect(u.placements).toHaveLength(4);
    // strips: 2 × (12 × 7.75) = 186
    expect(u.stripAreaIn2).toBeCloseTo(186, 9);
  });

  it("returns the shelf tail (8.55×7.75) and the plate tail (12×8.5) as off-cuts", () => {
    const r = nestBlanks({ ...BLANK_A, plates: [REMNANT_12x24] });
    const offs = r.usages[0].returnedOffcuts;
    expect(offs).toHaveLength(2);
    expect(offs[0]).toMatchObject({ kind: "shelf_tail" });
    expect(offs[0].widthIn).toBeCloseTo(8.55, 9);
    expect(offs[0].lengthIn).toBeCloseTo(7.75, 9);
    expect(offs[1]).toMatchObject({ kind: "plate_tail" });
    expect(offs[1].widthIn).toBeCloseTo(12, 9);
    expect(offs[1].lengthIn).toBeCloseTo(8.5, 9);
  });

  it("consumed area = strips − returned shelf tail = 186 − 66.2625 = 119.7375", () => {
    const r = nestBlanks({ ...BLANK_A, plates: [REMNANT_12x24] });
    expect(r.totalConsumedAreaIn2).toBeCloseTo(119.7375, 9);
    expect(r.totalBlankAreaIn2).toBeCloseTo(106.95, 9);
    expect(r.yieldPct).toBeCloseTo(106.95 / 119.7375, 9);
  });

  it("prefers the remnant over a full sheet even though the sheet also fits", () => {
    const r = nestBlanks({ ...BLANK_A, plates: [SHEET_48x96, REMNANT_12x24] });
    expect(r.usages).toHaveLength(1);
    expect(r.usages[0].plate.id).toBe("rem1");
  });
});

describe("nestBlanks — full sheet, perfect strip", () => {
  it("tiles 4 blanks in one strip of a 48×96 sheet at exactly 100% yield", () => {
    const r = nestBlanks({ ...BLANK_A, plates: [SHEET_48x96] });
    expect(r.ok).toBe(true);
    expect(r.usages[0].shelves).toHaveLength(1);
    // strip 48×7.75 minus returned 34.2×7.75 tail = 13.8×7.75 = exactly 4 blanks
    expect(r.totalConsumedAreaIn2).toBeCloseTo(106.95, 9);
    expect(r.yieldPct).toBeCloseTo(1, 9);
    // sheet tail 48×88.25 comes back to inventory
    const tail = r.usages[0].returnedOffcuts.find((o) => o.kind === "plate_tail")!;
    expect(tail.lengthIn).toBeCloseTo(88.25, 9);
  });
});

describe("nestBlanks — rotation and multi-plate", () => {
  it("rotates 90° when the rotated strip wastes less (S-block scenario)", () => {
    // 6061 blank 4.25 × 6.25, qty 5 on a 14×30 remnant:
    // shelf 1: 3 unrotated (h 6.25); shelf 2: 2 rotated (h 4.25) beats 2 unrotated.
    const r = nestBlanks({
      blankWIn: 4.25,
      blankLIn: 6.25,
      qty: 5,
      plates: [{ id: "rem6061", widthIn: 14, lengthIn: 30, isRemnant: true }],
    });
    expect(r.ok).toBe(true);
    const u = r.usages[0];
    expect(u.placements.filter((p) => !p.rotated)).toHaveLength(3);
    expect(u.placements.filter((p) => p.rotated)).toHaveLength(2);
    expect(r.totalConsumedAreaIn2).toBeCloseTo(147, 9); // 14×6.25 + 14×4.25
    expect(r.yieldPct).toBeCloseTo((5 * 26.5625) / 147, 9);
  });

  it("spills onto a second plate when the first can't hold the full qty", () => {
    const small: PlateInput[] = [
      { id: "p1", widthIn: 12, lengthIn: 8, isRemnant: true },
      { id: "p2", widthIn: 12, lengthIn: 8, isRemnant: true },
    ];
    const r = nestBlanks({ ...BLANK_A, qty: 5, plates: small });
    expect(r.ok).toBe(true);
    expect(r.usages).toHaveLength(2);
    expect(r.usages[0].placements.length + r.usages[1].placements.length).toBe(5);
  });

  it("reports ok=false when inventory can't hold the quantity", () => {
    const r = nestBlanks({
      ...BLANK_A,
      qty: 7,
      plates: [{ id: "p1", widthIn: 12, lengthIn: 8, isRemnant: true }],
    });
    expect(r.ok).toBe(false);
    expect(r.placedQty).toBe(3);
    expect(r.unplacedQty).toBe(4);
  });

  it("skips plates the blank can't fit in either orientation", () => {
    const r = nestBlanks({
      ...BLANK_A,
      plates: [{ id: "tiny", widthIn: 5, lengthIn: 5, isRemnant: true }],
    });
    expect(r.ok).toBe(false);
    expect(r.usages).toHaveLength(0);
  });

  it("is deterministic: identical input → identical output", () => {
    const input = { ...BLANK_A, plates: [SHEET_48x96, REMNANT_12x24] };
    expect(JSON.stringify(nestBlanks(input))).toBe(JSON.stringify(nestBlanks(input)));
  });
});
