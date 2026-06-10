import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

// All JSON columns are `text` with Zod-validated parse helpers (Postgres-portable).
// All money is integer cents; all dimensions are inches.

export const alloys = sqliteTable("alloys", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  family: text("family", { enum: ["aluminum", "nickel", "stainless"] }).notNull(),
  status: text("status", { enum: ["standard", "by_request"] }).notNull(),
  densityLbIn3: real("density_lb_in3"),
  minThicknessIn: real("min_thickness_in"),
  maxThicknessIn: real("max_thickness_in"),
  tempers: text("tempers").notNull().default("[]"), // JSON array
  defaultTemper: text("default_temper"),
  dfarsAvailable: integer("dfars_available").notNull().default(0),
});

export const stockedThicknesses = sqliteTable("stocked_thicknesses", {
  valueIn: real("value_in").primaryKey(),
});

export const priceBook = sqliteTable("price_book", {
  id: text("id").primaryKey(),
  alloyCode: text("alloy_code")
    .notNull()
    .references(() => alloys.code),
  basePerLb: real("base_per_lb").notNull(),
  effectiveDate: text("effective_date").notNull(),
  expiresDate: text("expires_date"),
});

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  inputType: text("input_type", { enum: ["pdf", "step", "text"] }).notNull(),
  rawInputText: text("raw_input_text"),
  rawInputFile: text("raw_input_file"),
  extractionJson: text("extraction_json").notNull(),
  settingsJson: text("settings_json").notNull(),
  status: text("status", {
    enum: ["priced", "needs_review", "rejected", "extraction_failed"],
  }).notNull(),
  validUntil: text("valid_until").notNull(),
  shipDate: text("ship_date"),
  totalCents: integer("total_cents"),
});

export const quoteLines = sqliteTable("quote_lines", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id")
    .notNull()
    .references(() => quotes.id),
  partEnvelopeJson: text("part_envelope_json").notNull(),
  blankJson: text("blank_json"),
  orientationJson: text("orientation_json").notNull(),
  alloyCode: text("alloy_code"),
  temper: text("temper"),
  qty: integer("qty").notNull(),
  breakdownJson: text("breakdown_json"),
  assumptionsJson: text("assumptions_json").notNull().default("[]"),
  issuesJson: text("issues_json").notNull().default("[]"),
  lineTotalCents: integer("line_total_cents"),
  /** Stretch §12: NestingRecord (nest layout + yield-based pricing), if applied. */
  nestingJson: text("nesting_json"),
});

// Stretch (§12) — defined now so the schema is complete; seeded only when nesting lands.
export const plates = sqliteTable("plates", {
  id: text("id").primaryKey(),
  alloyCode: text("alloy_code")
    .notNull()
    .references(() => alloys.code),
  thicknessIn: real("thickness_in").notNull(),
  widthIn: real("width_in").notNull(),
  lengthIn: real("length_in").notNull(),
  isRemnant: integer("is_remnant").notNull().default(0),
  parentPlateId: text("parent_plate_id"),
  status: text("status", { enum: ["available", "consumed"] })
    .notNull()
    .default("available"),
});
