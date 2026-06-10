// Persistence for assembled quotes (§4.4). JSON columns are text; reads are
// parsed back into the same shapes the UI renders — the UI does no arithmetic.
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client";
import { priceBook, quoteLines, quotes } from "../db/schema";
import { AssembledQuote } from "./assemble";
import type { NestingRecord } from "../nesting/price";

export interface PersistExtras {
  rawInputText?: string | null;
  rawInputFile?: string | null;
  /** Pre-generated id, so uploads can be saved under it before persisting. */
  id?: string;
  /** Stretch §12: nesting layout + yield pricing, when inventory allowed it. */
  nesting?: NestingRecord | null;
}

export function persistQuote(q: AssembledQuote, extras: PersistExtras = {}): string {
  const id = extras.id ?? nanoid(12);
  const d = db();

  d.insert(quotes)
    .values({
      id,
      createdAt: new Date().toISOString(),
      inputType: q.inputType,
      rawInputText: extras.rawInputText ?? null,
      rawInputFile: extras.rawInputFile ?? null,
      extractionJson: JSON.stringify(q.extractionResult),
      settingsJson: JSON.stringify({
        sideAllowanceIn: q.settings.sideAllowanceIn,
        minThicknessCleanupIn: q.settings.minThicknessCleanupIn,
        dfars: q.settings.dfars,
      }),
      status: q.status,
      validUntil: q.validUntil,
      shipDate: q.shipDate,
      totalCents: q.totalCents,
    })
    .run();

  if (q.status !== "extraction_failed") {
    d.insert(quoteLines)
      .values({
        id: nanoid(12),
        quoteId: id,
        partEnvelopeJson: JSON.stringify(q.partEnvelope),
        blankJson: q.blank ? JSON.stringify(q.blank) : null,
        orientationJson: JSON.stringify(q.orientations ?? []),
        alloyCode: q.alloyCode,
        temper: q.temper,
        qty: q.qty,
        breakdownJson: q.breakdown ? JSON.stringify(q.breakdown) : null,
        assumptionsJson: JSON.stringify(q.assumptions),
        issuesJson: JSON.stringify(q.issues),
        lineTotalCents: q.breakdown?.linesCents.lineTotal ?? null,
        nestingJson: extras.nesting ? JSON.stringify(extras.nesting) : null,
      })
      .run();
  }

  return id;
}

export function loadQuote(id: string) {
  const d = db();
  const quote = d.select().from(quotes).where(eq(quotes.id, id)).get();
  if (!quote) return null;
  const line = d.select().from(quoteLines).where(eq(quoteLines.quoteId, id)).get();
  return {
    ...quote,
    extraction: JSON.parse(quote.extractionJson),
    settings: JSON.parse(quote.settingsJson),
    line: line
      ? {
          ...line,
          partEnvelope: JSON.parse(line.partEnvelopeJson),
          blank: line.blankJson ? JSON.parse(line.blankJson) : null,
          orientations: JSON.parse(line.orientationJson),
          breakdown: line.breakdownJson ? JSON.parse(line.breakdownJson) : null,
          assumptions: JSON.parse(line.assumptionsJson),
          issues: JSON.parse(line.issuesJson),
          nesting: line.nestingJson ? (JSON.parse(line.nestingJson) as NestingRecord) : null,
        }
      : null,
  };
}

export function listQuotes() {
  const d = db();
  const rows = d.select().from(quotes).orderBy(desc(quotes.createdAt)).all();
  return rows.map((q) => {
    const line = d.select().from(quoteLines).where(eq(quoteLines.quoteId, q.id)).get();
    return {
      id: q.id,
      createdAt: q.createdAt,
      inputType: q.inputType,
      status: q.status,
      totalCents: q.totalCents,
      alloyCode: line?.alloyCode ?? null,
      temper: line?.temper ?? null,
      blank: line?.blankJson ? JSON.parse(line.blankJson) : null,
    };
  });
}

export function loadPriceBookRows() {
  return db().select().from(priceBook).all();
}
