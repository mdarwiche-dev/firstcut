// `npm run seed` (§4.6): drizzle-kit push creates/updates tables, then this
// script refreshes all seed rows. Idempotent: running twice yields the same state.
import { db } from "../src/db/client";
import {
  alloys,
  plates,
  priceBook,
  quoteLines,
  quotes,
  stockedThicknesses,
} from "../src/db/schema";
import { ALLOYS, BASE_PER_LB, STOCKED_THICKNESSES } from "../src/rules/catalog";

const PRICE_BOOK_EFFECTIVE = "2026-01-01";

async function main() {
  const d = db();

  // Demo refresh: clear everything, reinsert seed data.
  d.delete(quoteLines).run();
  d.delete(quotes).run();
  d.delete(plates).run();
  d.delete(priceBook).run();
  d.delete(stockedThicknesses).run();
  d.delete(alloys).run();

  d.insert(alloys)
    .values(
      ALLOYS.map((a) => ({
        code: a.code,
        name: a.name,
        family: a.family,
        status: a.status,
        densityLbIn3: a.densityLbIn3,
        minThicknessIn: a.minThicknessIn,
        maxThicknessIn: a.maxThicknessIn,
        tempers: JSON.stringify(a.tempers),
        defaultTemper: a.defaultTemper,
        dfarsAvailable: a.dfarsAvailable ? 1 : 0,
      })),
    )
    .run();

  d.insert(stockedThicknesses)
    .values(STOCKED_THICKNESSES.map((t) => ({ valueIn: t })))
    .run();

  // Deterministic ids (rather than nanoid) so breakdowns reference a stable
  // priceBookId across reseeds.
  d.insert(priceBook)
    .values(
      Object.entries(BASE_PER_LB).map(([alloyCode, basePerLb]) => ({
        id: `pb_${alloyCode}_${PRICE_BOOK_EFFECTIVE}`,
        alloyCode,
        basePerLb,
        effectiveDate: PRICE_BOOK_EFFECTIVE,
        expiresDate: null,
      })),
    )
    .run();

  // Stretch §12 plate inventory: one known remnant per demo scenario (sized so
  // fixture A and the STEP block nest onto them deterministically) plus full
  // sheets as fallback. Quoting consumes plates; reseed restores them.
  const PLATE_SEED = [
    { id: "pl_7075_125_rem", alloyCode: "7075", thicknessIn: 1.25, widthIn: 12, lengthIn: 24, isRemnant: 1 },
    { id: "pl_7075_125_sheet", alloyCode: "7075", thicknessIn: 1.25, widthIn: 48, lengthIn: 96, isRemnant: 0 },
    { id: "pl_6061_125_rem", alloyCode: "6061", thicknessIn: 1.25, widthIn: 14, lengthIn: 30, isRemnant: 1 },
    { id: "pl_6061_125_sheet", alloyCode: "6061", thicknessIn: 1.25, widthIn: 48, lengthIn: 96, isRemnant: 0 },
    { id: "pl_5083_075_sheet", alloyCode: "5083", thicknessIn: 0.75, widthIn: 48, lengthIn: 96, isRemnant: 0 },
  ];
  d.insert(plates)
    .values(PLATE_SEED.map((p) => ({ ...p, parentPlateId: null, status: "available" as const })))
    .run();

  // Fixture generation (§9) is invoked here once scripts/generate-fixtures.ts lands.
  const fs = await import("node:fs");
  if (fs.existsSync(new URL("./generate-fixtures.ts", import.meta.url))) {
    const generatorPath = "./generate-fixtures";
    const { generateFixtures } = await import(generatorPath);
    await generateFixtures();
  } else {
    console.log("(fixture generator not present yet — skipping)");
  }

  console.log("Seeded:");
  console.table([
    { table: "alloys", rows: ALLOYS.length },
    { table: "stocked_thicknesses", rows: STOCKED_THICKNESSES.length },
    { table: "price_book", rows: Object.keys(BASE_PER_LB).length },
    { table: "plates", rows: 5 },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
