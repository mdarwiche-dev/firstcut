import { describe, expect, it } from "vitest";
import { formMaterialRawText } from "../step";
import { normalizeMaterial } from "../../rules/normalizeMaterial";
import { ALLOYS } from "../../rules/catalog";

// The STEP form's alloy+temper selection must round-trip losslessly through
// the deterministic normalizer (§5.3 → §5.5). AABB parsing itself is covered
// by the fixture integration test once fixtures/S-block.step exists.
describe("STEP form material round-trip", () => {
  const standard = ALLOYS.filter((a) => a.status === "standard");

  it.each(standard.map((a) => [a.code, a.defaultTemper] as const))(
    "%s / %s survives normalize(formMaterialRawText(...))",
    (code, temper) => {
      const m = normalizeMaterial(formMaterialRawText(code, temper));
      expect(m.alloyCode).toBe(code);
      expect(m.temper).toBe(temper);
    },
  );

  it("every stocked temper of every standard alloy round-trips", () => {
    for (const alloy of standard) {
      for (const temper of alloy.tempers) {
        const m = normalizeMaterial(formMaterialRawText(alloy.code, temper));
        expect(`${m.alloyCode}/${m.temper}`).toBe(`${alloy.code}/${temper}`);
      }
    }
  });
});
