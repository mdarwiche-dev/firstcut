import { describe, expect, it } from "vitest";
import { addBusinessDays, addCalendarDays, computeLeadTime } from "../leadTime";

// §7.2 lead-time matrix. 2026-06-08 is a Monday.
describe("computeLeadTime matrix", () => {
  const base = { blankT: 1, maxLineQty: 1, dfars: false, quoteDate: "2026-06-08" };

  it.each([
    [{}, 2],
    [{ blankT: 4.0 }, 2], // boundary: > 4.0, not ≥
    [{ blankT: 5.0 }, 3],
    [{ maxLineQty: 10 }, 2], // boundary: > 10
    [{ maxLineQty: 11 }, 3],
    [{ dfars: true }, 4],
    [{ blankT: 6, maxLineQty: 12, dfars: true }, 6],
  ])("%o → %i days", (overrides, days) => {
    expect(computeLeadTime({ ...base, ...overrides }).days).toBe(days);
  });

  it("lists contributors", () => {
    const lt = computeLeadTime({ ...base, blankT: 8, maxLineQty: 12, dfars: true });
    expect(lt.contributors).toHaveLength(4);
  });
});

describe("business-day ship date (weekend skipping)", () => {
  it("Friday + 2 business days = Tuesday (§11)", () => {
    // 2026-01-02 is a Friday → Mon 01-05, Tue 01-06
    expect(addBusinessDays("2026-01-02", 2)).toBe("2026-01-06");
  });

  it("Monday + 2 = Wednesday (no weekend crossed)", () => {
    expect(addBusinessDays("2026-06-08", 2)).toBe("2026-06-10");
  });

  it("Thursday + 2 skips the weekend = Monday", () => {
    // 2026-06-11 Thu → Fri 06-12, Mon 06-15
    expect(addBusinessDays("2026-06-11", 2)).toBe("2026-06-15");
  });

  it("month rollover", () => {
    // 2026-06-30 Tue + 2 = Thu 07-02
    expect(addBusinessDays("2026-06-30", 2)).toBe("2026-07-02");
  });
});

describe("validity window", () => {
  it("quote date + 14 calendar days", () => {
    expect(addCalendarDays("2026-06-09", 14)).toBe("2026-06-23");
    expect(addCalendarDays("2026-12-25", 14)).toBe("2027-01-08");
  });
});
