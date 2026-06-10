import { describe, expect, it } from "vitest";
import { normalizeMaterial } from "../normalizeMaterial";

// §5.5 pattern table — every row exercised.
describe("normalizeMaterial", () => {
  it.each([
    ["AL 7075-T651", "7075", "T651", false],
    ["7075 T651", "7075", "T651", false],
    ["7075-T7351", "7075", "T7351", false],
    ["7075", "7075", null, false],
    ["6061-T6511", "6061", "T6511", false],
    ["AL 6061-T651", "6061", "T651", false],
    ["AL 6061-T6", "6061", "T651", true], // T6 maps to default T651, assumption recorded
    ["6061", "6061", null, false],
    ["7050-T7451", "7050", "T7451", false],
    ["7050-T7651", "7050", "T7651", false],
    ["7050", "7050", null, false],
    ["5052", "5052", null, false],
    ["5083 PLATE", "5083", null, false],
    ["5086", "5086", null, false],
    ["ATP-5", "CAST_TJ", null, false],
    ["ATP5", "CAST_TJ", null, false],
    ["CAST TOOL & JIG PLATE", "CAST_TJ", null, false],
    ["JIG PLATE", "CAST_TJ", null, false],
    ["MIC-6", "CAST_TJ", null, false],
    ["INCONEL 625", "INCONEL_625", null, false],
    ["INCONEL 718", "INCONEL_718", null, false],
    ["316 STAINLESS STEEL", "SS_316", null, false],
    ["STAINLESS 316", "SS_316", null, false],
    ["304 SS", "SS_304", null, false],
    ["SS 304", "SS_304", null, false],
    ["17-4 PH STAINLESS", "SS_17_4PH", null, false],
    ["17-4PH", "SS_17_4PH", null, false],
    ["4140 STEEL", "OTHER_METAL", null, false],
    ["A36", "OTHER_METAL", null, false],
    ["STEEL", "OTHER_METAL", null, false],
    ["TITANIUM", "OTHER_METAL", null, false],
    ["TI-6AL-4V", "OTHER_METAL", null, false],
    ["UNOBTAINIUM ALLOY X", "UNRECOGNIZED", null, false],
  ])("%s → %s / %s", (raw, alloyCode, temper, temperMapped) => {
    const m = normalizeMaterial(raw);
    expect(m.alloyCode).toBe(alloyCode);
    expect(m.temper).toBe(temper);
    expect(m.temperMapped).toBe(temperMapped);
  });

  it("null / empty rawText → UNSPECIFIED", () => {
    expect(normalizeMaterial(null).alloyCode).toBe("UNSPECIFIED");
    expect(normalizeMaterial("  ").alloyCode).toBe("UNSPECIFIED");
  });

  it("longest match wins: 7075-T651 does not fall through to bare 7075", () => {
    expect(normalizeMaterial("7075-T651")).toEqual({
      alloyCode: "7075",
      temper: "T651",
      temperMapped: false,
    });
  });
});
