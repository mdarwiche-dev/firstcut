// Stretch §12: inventory side of nesting. Selects available plates for the
// quote's alloy+thickness, runs the pure nest + nested pricing, and — only
// when the whole quantity fits — flips consumed plates and inserts returned
// off-cuts as remnant rows. Simple pricing is never touched: callers persist
// the returned record alongside the untouched v1 breakdown.
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client";
import { plates } from "../db/schema";
import { Breakdown, PriceInput } from "../pricing/price";
import { nestBlanks } from "./nest";
import { NestingRecord, priceNested } from "./price";

const T_EPS = 1e-6;

/**
 * Returns null (and changes nothing) when no plates of the right
 * alloy+thickness exist or the quantity doesn't fully fit — the quote then
 * shows simple pricing only.
 */
export function applyNesting(opts: {
  alloyCode: string;
  blank: { thicknessIn: number; widthIn: number; lengthIn: number };
  qty: number;
  priceInput: PriceInput;
  simpleBreakdown: Breakdown;
  /** Injectable for tests; defaults to the app database. */
  dbi?: ReturnType<typeof db>;
}): NestingRecord | null {
  const d = opts.dbi ?? db();

  const available = d
    .select()
    .from(plates)
    .where(and(eq(plates.alloyCode, opts.alloyCode), eq(plates.status, "available")))
    .all()
    .filter((p) => Math.abs(p.thicknessIn - opts.blank.thicknessIn) < T_EPS);
  if (available.length === 0) return null;

  const nest = nestBlanks({
    blankWIn: opts.blank.widthIn,
    blankLIn: opts.blank.lengthIn,
    qty: opts.qty,
    plates: available.map((p) => ({
      id: p.id,
      widthIn: p.widthIn,
      lengthIn: p.lengthIn,
      isRemnant: p.isRemnant === 1,
    })),
  });
  if (!nest.ok) return null;

  const pricing = priceNested({
    nest,
    input: opts.priceInput,
    simpleBreakdown: opts.simpleBreakdown,
  });

  d.transaction((tx) => {
    for (const usage of nest.usages) {
      tx.update(plates)
        .set({ status: "consumed" })
        .where(eq(plates.id, usage.plate.id))
        .run();
      for (const off of usage.returnedOffcuts) {
        tx.insert(plates)
          .values({
            id: `rem_${nanoid(10)}`,
            alloyCode: opts.alloyCode,
            thicknessIn: opts.blank.thicknessIn,
            widthIn: off.widthIn,
            lengthIn: off.lengthIn,
            isRemnant: 1,
            parentPlateId: usage.plate.id,
            status: "available",
          })
          .run();
      }
    }
  });

  return { nest, pricing };
}
