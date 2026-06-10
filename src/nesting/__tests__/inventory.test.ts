import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { plates } from "../../db/schema";
import { PriceInput, priceQuote } from "../../pricing/price";
import { applyNesting } from "../inventory";

// §12 acceptance: remnant rows verifiably created, consumed plates flipped.
// Runs against an in-memory SQLite with the same plates DDL — the app DB on
// disk is never touched by tests.
function memoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE plates (
      id text PRIMARY KEY,
      alloy_code text NOT NULL,
      thickness_in real NOT NULL,
      width_in real NOT NULL,
      length_in real NOT NULL,
      is_remnant integer NOT NULL DEFAULT 0,
      parent_plate_id text,
      status text NOT NULL DEFAULT 'available'
    );
  `);
  return drizzle(sqlite) as unknown as ReturnType<typeof db>;
}

const INPUT_A: PriceInput = {
  blank: { t: 1.25, w: 3.45, l: 7.75 },
  densityLbIn3: 0.1019,
  basePerLb: 6.4,
  priceBookId: "pb_7075_2026-01-01",
  qty: 4,
  dfars: false,
  quoteDate: "2026-01-15",
};

describe("applyNesting (§12 inventory mutations)", () => {
  let dbi: ReturnType<typeof db>;

  beforeEach(() => {
    dbi = memoryDb();
    dbi
      .insert(plates)
      .values([
        { id: "rem1", alloyCode: "7075", thicknessIn: 1.25, widthIn: 12, lengthIn: 24, isRemnant: 1, parentPlateId: null, status: "available" },
        { id: "sheet1", alloyCode: "7075", thicknessIn: 1.25, widthIn: 48, lengthIn: 96, isRemnant: 0, parentPlateId: null, status: "available" },
        { id: "wrong_t", alloyCode: "7075", thicknessIn: 2, widthIn: 48, lengthIn: 96, isRemnant: 0, parentPlateId: null, status: "available" },
      ])
      .run();
  });

  const apply = () =>
    applyNesting({
      alloyCode: "7075",
      blank: { thicknessIn: 1.25, widthIn: 3.45, lengthIn: 7.75 },
      qty: 4,
      priceInput: INPUT_A,
      simpleBreakdown: priceQuote(INPUT_A),
      dbi,
    });

  it("nests onto the remnant, beats simple by $22.59, flips it to consumed", () => {
    const rec = apply();
    expect(rec).not.toBeNull();
    expect(rec!.pricing.breakdown.orderCents.total).toBe(26950);
    expect(rec!.pricing.deltaCents).toBe(2259);

    const rem1 = dbi.select().from(plates).where(eq(plates.id, "rem1")).get()!;
    expect(rem1.status).toBe("consumed");
    const sheet1 = dbi.select().from(plates).where(eq(plates.id, "sheet1")).get()!;
    expect(sheet1.status).toBe("available"); // untouched
  });

  it("inserts the two returned off-cuts as remnant rows with parentPlateId", () => {
    apply();
    const children = dbi.select().from(plates).where(eq(plates.parentPlateId, "rem1")).all();
    expect(children).toHaveLength(2);
    for (const c of children) {
      expect(c.isRemnant).toBe(1);
      expect(c.status).toBe("available");
      expect(c.alloyCode).toBe("7075");
      expect(c.thicknessIn).toBe(1.25);
    }
    const dims = children.map((c) => `${c.widthIn}x${c.lengthIn}`).sort();
    expect(dims).toEqual(["12x8.5", "8.55x7.75"]);
  });

  it("a second identical quote no longer sees the consumed remnant", () => {
    apply();
    const rec2 = apply();
    expect(rec2).not.toBeNull();
    expect(rec2!.nest.usages.every((u) => u.plate.id !== "rem1")).toBe(true);
  });

  it("returns null and mutates nothing when no plate of the thickness exists", () => {
    const rec = applyNesting({
      alloyCode: "7075",
      blank: { thicknessIn: 3, widthIn: 3.45, lengthIn: 7.75 },
      qty: 4,
      priceInput: { ...INPUT_A, blank: { ...INPUT_A.blank, t: 3 } },
      simpleBreakdown: priceQuote(INPUT_A),
      dbi,
    });
    expect(rec).toBeNull();
    expect(dbi.select().from(plates).all()).toHaveLength(3);
  });

  it("returns null and mutates nothing when the qty doesn't fully fit", () => {
    dbi.delete(plates).where(eq(plates.id, "sheet1")).run();
    const rec = applyNesting({
      alloyCode: "7075",
      blank: { thicknessIn: 1.25, widthIn: 3.45, lengthIn: 7.75 },
      qty: 50, // 12×24 remnant holds at most 9
      priceInput: { ...INPUT_A, qty: 50 },
      simpleBreakdown: priceQuote({ ...INPUT_A, qty: 50 }),
      dbi,
    });
    expect(rec).toBeNull();
    const rem1 = dbi.select().from(plates).where(eq(plates.id, "rem1")).get()!;
    expect(rem1.status).toBe("available");
  });
});
