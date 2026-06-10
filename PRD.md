# FirstCut — PRD

**Working title:** FirstCut. "FirstCut" because quoting starts from the first artifact in the buyer's workflow — the part drawing — and it's the first cut of a quote before a human touches it.

**One-liner:** Upload a part drawing (PDF), a STEP file, or a pasted spec; an LLM *extracts* the part envelope and material spec; deterministic TypeScript code *converts* the part envelope to a recommended stock blank, *validates* it against a catalog, and *prices* it with a fully itemized, hand-recomputable breakdown — with every uncertainty surfaced as an explicit assumption or review flag, never a silent guess.

**Status of this document:** Implementation-ready. Claude Code should be able to build this repo section by section without asking questions. Where a value is invented, it is stated as invented. Where a value is grounded in Nox Metals' public materials page, it is marked as such.

**Build progress** (maintained by Claude Code; last updated 2026-06-09):

- ✅ **§15.1 Scaffold + DB schema + seed** — Next.js 16 / Drizzle / SQLite; `npm run seed` is idempotent (drizzle-kit push + row refresh). Finding: this machine runs Node 23 with broken Xcode CLT, so `better-sqlite3` is pinned to **11.10.0** (last release with a Node-23 darwin-arm64 prebuild) — don't bump past 11.x without switching to Node LTS.
- ✅ **§15.2 Rules + pricing engines (tests first)** — 96 Vitest tests green, `tsc` clean; §6.3 and §6.4 orientation tables and the §7.3 breakdown ($292.09, 2-day lead) assert exactly; engines are pure TS with zero Anthropic SDK imports (§10.9). Finding: the §7.1 line minimum ($45) is mathematically unreachable in v1 (setup $25 + minimum cutting + 18% margin floor every line above ~$52); logic implemented and property-tested anyway.
- ✅ **§5.1 Extraction Zod schema** — including the `inferred`-never-`high` refinement, schema-tested.
- ✅ **§15.3 Extraction adapters + quote pipeline** — PDF/text via Claude with retry-once-on-failure (mocked-client tests prove exactly one retry, error state on second failure, `inferred+high` blocked at the gate); STEP via occt-import-js AABB with form material; `assembleQuote` implements all §5.5 outcomes and §5.6 confidence mappings (125 tests green). Findings: project uses Zod 4, whose built-in `z.toJSONSchema` replaces the PRD's `zod-to-json-schema` (Zod-3-only); normalizer gained explicit marine-temper rows (5052-H32, 5083-H116, 5086-H116) so the STEP form round-trips tempers losslessly.
- ✅ **§15.4 Fixture generator** — pdf-lib shop drawings A–D (verified visually: views, dim lines with arrowheads, notes, title block), hand-authored AP214 manifold-brep STEP box that occt-import-js parses to 6×4×1 in exactly, text fixtures JSON; all regenerated idempotently by `npm run seed`. **`npm run e2e:live` is written but unrun — blocked on `ANTHROPIC_API_KEY`.**
- ✅ **§15.5 UI + persistence** — intake tabs with fixture chips and settings panel, `/quotes/[id]` (status badges, confidence/source pills, amber/red panels, envelope→blank SVG, 3-orientation table, hand-recomputable breakdown), `/quotes` list, §13.3 disclaimer in footer of every page. Verified live through the running server on the STEP path (no LLM): $284.34 quote hand-recomputes, persists across server restart. Finding: shadcn CLI requires interactive setup, so equivalent components are hand-rolled with Tailwind (same dark-industrial look; swap-in possible later).
- ✅ **§15.6 Acceptance pass** — all 13 §10 criteria verified: 130 tests green, tsc clean, production build clean, and `npm run e2e:live` passed against the real API (fixture A extracted and priced to exactly $292.09; B produced QTY_DEFAULTED + TEMPER_DEFAULTED and the correct mm→in conversion; C routed 316 SS to needs_review with no price; D rejected oversize with all 3 orientations invalid; T1 $292.09, T2 5083 qty-12 with 7% break + 3-day lead, T3 degraded gracefully; STEP path priced with 4% break). No findings beyond the per-phase notes above — live Claude vision read every fixture drawing correctly on the first attempt.
- ✅ **§12 Nesting stretch** — shelf-FFD guillotine nesting with 90° rotation, remnant-first plate selection, off-cut returns (≥6"×6") as new remnant rows, consumed-plate flips, per-plate hand-recomputable material lines, SVG nest visualization with hatched returns, and the Simple-vs-Nested toggle; 21 new tests (151 total), live-verified through the server (STEP fixture: $284.34 simple → $269.80 nested at 90.3% yield on the seeded 6061 remnant; mutations confirmed in the plates table). **Finding 1 (spec conflict):** under §12's literal cost model, consumed area ≥ blank area by construction (yield ≤ 100%), so nested material can only equal simple pricing at a perfect tile and exceeds it otherwise — the acceptance scenario "nesting against a known remnant beats simple pricing" was unsatisfiable as written. Resolved with the minimal addition: remnant-sourced material is charged at an invented `REMNANT_RATE_FACTOR = 0.7` (salvage pricing), documented in code/README; the seeded scenario then beats simple by exactly $22.59 ($292.09 → $269.50), asserted to the cent. **Finding 2 (pre-existing route bug caught by the live nesting check):** the intake route's `num()` helper treated omitted form fields as 0 (`Number(null) === 0`), silently zeroing the allowance defaults for API callers (the UI always sends explicit values, so all earlier tests passed); with zero allowances, float noise from mm→in conversion (6.000000000000001) made a degenerate orientation win a volume tie. Fixed to fall back on null/empty. Simple pricing remains byte-identical (frozen §7.3 breakdown + 200-case recompute property test).
- ✅ **Playwright browser e2e** (post-§12 addition) — 5 specs driving the real UI in Chromium against a seeded production server (`npm run e2e`): intake tabs/chips/disclaimer, server-side validation error surfacing, STEP chip → $284.34 quote → nest toggle ($269.80, −$14.54, remnant + hatched off-cuts) → reload persistence, quotes list, and a live-key-gated fixture-A run ($292.09 via real Claude vision, nested $269.50). Finding: Next 16's dev server holds a per-project singleton lock, so the Playwright webServer uses `next build && next start` on its own port rather than a second `next dev`.

---

## 1. Context, Why-This-Shape, Personas

### 1.1 Context

This is an **independent demo project** inspired by Nox Metals (noxmetals.co, YC S25, Detroit), an AI-powered automated aluminum-cutting factory. The author does **not** work at Nox. The project runs entirely on dummy data and carries a non-affiliation disclaimer in the README and the UI footer (exact text in §13.3). The intended audience is Nox engineers; the architecture choices in this PRD are themselves the pitch.

What Nox already has (do **not** rebuild as the headline):

- **Instant-quote page** — alloy/temper/dimensions/quantity → price.
- **Gondor** (customer portal) — paste a material list or part-spec text, AI parses and prices in <60s; order tracking, mill certs, one-click reorder.
- **Nox Nest** — ML bin-packing/nesting that optimizes cut paths against inventory and turns drops into remnant inventory.

**The gap this demo targets:** Nox's intake assumes the buyer has already translated their machined **part** into a stock **blank** spec (alloy, temper, T×W×L). In reality, upstream of every RFQ is a part drawing or CAD model, and a human at the shop does the part→blank translation manually. FirstCut moves quoting one step up the funnel:

> Part drawing (PDF) or STEP file → extract part envelope + material spec → rules engine converts envelope to recommended blank → deterministic pricing engine returns an itemized quote.

### 1.2 Non-negotiable architecture principle

**The LLM never prices anything and never decides validity. It only extracts.**

- Claude (vision) reads the drawing and emits a structured extraction (Zod-validated).
- Everything downstream is deterministic TypeScript: material normalization, catalog validation, envelope→blank rules, orientation optimization, pricing, lead times.
- Every dollar on a quote must be reproducible by hand from the displayed breakdown.
- Anything the LLM was unsure about surfaces as an explicit **assumption** (amber) or **needs-review** flag (red) on the quote — never a silent guess baked into a price.
- LLM output that fails schema validation is retried once with the error appended; a second failure produces an error state, never a fabricated quote.

Why this shape: pricing in a metals service center is a trust product. An LLM-in-the-loop price is unauditable; an LLM-at-the-edge extractor feeding a deterministic engine is auditable line by line. This is the same split Nox presumably wants at scale, demonstrated one funnel step earlier than their current intake.

### 1.3 Personas

1. **Machine-shop estimator (primary).** Has a customer's part drawing PDF. Today they eyeball the envelope, add cleanup stock, pick a plate thickness, and type a blank spec into a quote tool. FirstCut does that translation and shows its work.
2. **Buyer/engineer with CAD.** Has a STEP file, knows the alloy, wants a blank price without producing a 2D drawing first.
3. **Nox engineer (the demo audience).** Evaluates whether the extract/price split, the rules layer, and the failure-mode handling are production-shaped.

---

## 2. Scope

### 2.1 v1 (must ship; acceptance criteria in §10)

- Three intake paths (PDF drawing via Claude vision, STEP via occt-import-js, pasted text via Claude text) sharing one downstream pipeline.
- Zod extraction schema with per-field confidence + source; deterministic material normalizer.
- Envelope→blank rules: per-side machining allowance, thickness snap-up, catalog validation, 3-axis orientation optimization, default-temper assumption, cheapest-qualifying-alloy recommendation when material unspecified, DFARS toggle.
- Deterministic pricing + lead-time engine with itemized, hand-recomputable breakdown.
- "By request" metals (Inconel, stainless, steel, titanium, anything non-aluminum) recognized and routed to manual review with **no price**.
- Quote persistence (SQLite via Drizzle) with raw input, extraction JSON, and full breakdown; shareable `/quotes/[id]` URL; `/quotes` list.
- Seeded catalog/price book; generated PDF/STEP/text fixtures; Vitest suites for rules and pricing.
- Dark industrial UI (Tailwind + shadcn/ui, mono font for numbers), non-affiliation disclaimer in footer.

### 2.2 Stretch (only after all v1 acceptance criteria pass)

**Inventory-aware guillotine nesting.**

- Seed ~60 plates including odd-size remnants (spec in §4.5).
- Shelf-based first-fit-decreasing guillotine placement of blanks onto plates of the matching alloy+thickness.
- Yield affects material cost: the customer is charged for the **consumed strip area** (blank area + allocated guillotine waste), not the bare blank area, but never more than the simple-pricing material cost × 1.0 — nesting savings only flow when remnant credit applies (formula in §12).
- Off-cuts ≥ 6"×6" return to inventory as remnants (new `plates` rows with `isRemnant = true`, `parentPlateId` set).
- SVG nest visualization on the quote page; a "Simple vs Nested pricing" toggle showing both numbers side by side.

### 2.3 Out of scope (do not build)

Auth, payments, real prices, non-rectangular blanks (no circles, rings, profiles), kerf-level physics, saw-time simulation, multi-part assemblies in one drawing, GD&T interpretation beyond capturing tolerance notes as text, emails/notifications, mobile-specific layouts.

---

## 3. System architecture

```
                        ┌────────────────────────────────────────────┐
                        │                INTAKE (LLM zone)           │
  PDF drawing ──render──► Claude vision (claude-sonnet-4-6)          │
  Pasted text ──────────► Claude text  (claude-sonnet-4-6)           │
                        │        └── strict Zod ExtractionSchema     │
  STEP file ────────────► occt-import-js AABB (no LLM)               │
                        └───────────────────┬────────────────────────┘
                                            │  ExtractionResult (validated or error — nothing else crosses)
                        ┌───────────────────▼────────────────────────┐
                        │        DETERMINISTIC ZONE (pure TS)        │
                        │  normalizeMaterial → validateCatalog →     │
                        │  computeBlank (allowances, snap,           │
                        │  orientation search) → priceQuote →        │
                        │  leadTime → persist                        │
                        └───────────────────┬────────────────────────┘
                                            ▼
                              /quotes/[id]  (breakdown, assumptions,
                               needs-review flags, envelope→blank visual)
```

**Stack (fixed):** Next.js 14+ App Router · TypeScript end-to-end · Drizzle ORM + SQLite (`better-sqlite3`), schema portable to Postgres (no SQLite-only column types; use `integer`/`real`/`text`; JSON stored as `text` with Zod parse on read) · Anthropic TypeScript SDK, model `claude-sonnet-4-6`, `ANTHROPIC_API_KEY` env var · Zod as the single source of truth for extraction schema / validation / engine input types · Tailwind + shadcn/ui · Vitest.

**Setup contract:** `npm i && npm run seed && npm run dev` is all that's needed. `npm run seed` creates the SQLite DB, seeds catalog/price book/plates, and generates all fixtures (PDFs + STEP + text) into `/fixtures`.

---

## 4. Data model (Drizzle, SQLite, Postgres-portable)

All tables in `src/db/schema.ts`. JSON columns are `text` with Zod-validated parse helpers. IDs are `nanoid(12)` strings unless noted.

### 4.1 `alloys`

| column | type | notes |
|---|---|---|
| code | text PK | `6061`, `7075`, `7050`, `5052`, `5083`, `5086`, `CAST_TJ`, `INCONEL_625`, `INCONEL_718`, `SS_304`, `SS_316`, `SS_17_4PH` |
| name | text | e.g. "6061 Aluminum Plate", "Cast Tool & Jig Plate (ATP-5 type)" |
| family | text | `aluminum` \| `nickel` \| `stainless` |
| status | text | `standard` \| `by_request` |
| densityLbIn3 | real | see seed values |
| minThicknessIn | real | |
| maxThicknessIn | real | |
| tempers | text (JSON array) | stocked tempers |
| defaultTemper | text | applied when temper missing (assumption recorded) |
| dfarsAvailable | integer (bool) | 1 for all aluminum alloys in this demo |

**Seed values (grounded in Nox's public materials page — keep accurate):**

| code | tempers | thickness range | density (lb/in³) | status |
|---|---|---|---|---|
| 6061 | T651, T6511 | 0.25"–10" | 0.0975 | standard |
| 7075 | T651, T7351 | 0.25"–6" | 0.1019 | standard |
| 7050 | T7451, T7651 | 0.25"–6" | 0.1020 | standard |
| 5052 | H32 (default) | 0.25"–40" (as listed; stocked increments cap effective max at 10") | 0.0968 | standard |
| 5083 | H116 (default) | 0.25"–40" (same cap) | 0.0961 | standard |
| 5086 | H116 (default) | 0.25"–40" (same cap) | 0.0958 | standard |
| CAST_TJ | (none / "precision ground") | 0.25"–4" | 0.0960 | standard |
| INCONEL_625, INCONEL_718, SS_304, SS_316, SS_17_4PH | — | — | — | by_request |

Default tempers: 6061→T651, 7075→T651, 7050→T7451, marine series→ their H-temper above, CAST_TJ→none. (Marine-series temper values are invented placeholders; the temper *mechanism* is what's demonstrated.)

### 4.2 `stocked_thicknesses`

Single-column table `valueIn real`, seeded with the global increment list (grounded):

```
0.25, 0.375, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10
```

An alloy stocks the subset within `[minThicknessIn, maxThicknessIn]`.

**Stock plate sizes (grounded):** widths 48"/60", lengths 96"/144". Hard-coded constant `STOCK_PLATE_SIZES = [{w:48,l:96},{w:48,l:144},{w:60,l:96},{w:60,l:144}]`. A blank is **rejectable** if no orientation fits within max width 60" and max length 144".

### 4.3 `price_book`

| column | type | notes |
|---|---|---|
| id | text PK | |
| alloyCode | text FK→alloys | |
| basePerLb | real | invented-but-plausible, see seed |
| effectiveDate | text (ISO date) | seed one row per alloy effective `2026-01-01` |
| expiresDate | text nullable | null = open |

**Seed base $/lb (invented):** 6061 = 3.45 · 5052 = 3.90 · 5086 = 3.90 · 5083 = 4.10 · CAST_TJ = 4.60 · 7075 = 6.40 · 7050 = 8.10.

**Per-thickness variation (deterministic, invented):**

```
ratePerLb(alloy, t) = basePerLb(alloy) + 0.02 × thicknessIndex(t)
```

where `thicknessIndex(t)` is the 0-based index of `t` in the global stocked-thickness list (0.25→0, 0.375→1, … 1.25→5, … 10→14). Example: 7075 at 1.25" → 6.40 + 0.02×5 = **6.50/lb**.

### 4.4 `quotes` and `quote_lines`

`quotes`:

| column | type | notes |
|---|---|---|
| id | text PK | nanoid, used in URL |
| createdAt | text ISO datetime | |
| inputType | text | `pdf` \| `step` \| `text` |
| rawInputText | text nullable | pasted text, if any |
| rawInputFile | text nullable | path under `/data/uploads/` (PDF/STEP stored on disk; path persisted) |
| extractionJson | text | the full validated `ExtractionResult`, or the structured error if extraction failed |
| settingsJson | text | allowances + DFARS used: `{ sideAllowanceIn, minThicknessCleanupIn, dfars }` |
| status | text | `priced` \| `needs_review` \| `rejected` \| `extraction_failed` |
| validUntil | text ISO date | createdAt + 14 days |
| shipDate | text ISO date nullable | null unless `priced` |
| totalCents | integer nullable | |

`quote_lines` (v1 produces exactly one line per quote; the schema supports multiple for future multi-part intake):

| column | type | notes |
|---|---|---|
| id, quoteId | text | FK |
| partEnvelopeJson | text | `{ lengthIn, widthIn, thicknessIn, sourceUnits }` (converted to inches) |
| blankJson | text nullable | `{ thicknessIn, widthIn, lengthIn }` |
| orientationJson | text | all 3 candidates with volumes + validity + chosen flag + reason |
| alloyCode, temper | text nullable | |
| qty | integer | |
| breakdownJson | text nullable | full pricing breakdown (§7.4 shape) |
| assumptionsJson | text | array of `{ code, message }` |
| issuesJson | text | array of `{ code, severity: 'review'\|'reject', message }` |
| lineTotalCents | integer nullable | |

All money persisted as **integer cents**. All dimensions persisted in **inches** (converted at intake; original units recorded in extraction).

### 4.5 `plates` (stretch only)

| column | type |
|---|---|
| id | text PK |
| alloyCode | text FK |
| thicknessIn, widthIn, lengthIn | real |
| isRemnant | integer (bool) |
| parentPlateId | text nullable |
| status | text: `available` \| `consumed` |

Seed ~60 rows: full stock sheets across the standard alloys/thicknesses plus ~15 odd-size remnants (e.g., 6061 1.0" 22"×31", 7075 1.25" 14"×40", minimum 6"×6").

### 4.6 Seed script (`npm run seed` → `scripts/seed.ts`)

1. Create/refresh `data/firstcut.db` (drop + recreate tables — this is a demo).
2. Insert alloys, stocked thicknesses, price book (effective 2026-01-01), plates.
3. Invoke `scripts/generate-fixtures.ts` (§9) to write `/fixtures/*.pdf`, `/fixtures/*.step`, `/fixtures/text-fixtures.json`.
4. Print a summary table to stdout.

Idempotent: running twice yields the same state.

---

## 5. Intake pipeline

Three input paths converge on one type: `ExtractionResult`. Nothing downstream knows or cares which path produced it.

### 5.1 The Zod extraction schema (single source of truth)

`src/extraction/schema.ts`. This exact schema is used for (a) Claude structured output validation, (b) the STEP/text adapters, (c) the rules-engine input type.

```ts
import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export const FieldSource = z.enum([
  "title_block",        // read from the drawing title block
  "dimension_callout",  // read from a dimension line/callout
  "notes",              // general notes block on the drawing
  "user_text",          // pasted text input
  "geometry",           // computed from STEP AABB
  "form_field",         // user-supplied form value (e.g., STEP material)
  "inferred",           // LLM inferred it; must never be high confidence
]);

const numField = z.object({
  value: z.number().positive(),
  confidence: Confidence,
  source: FieldSource,
});
const nullableStrField = z.object({
  value: z.string().nullable(),
  confidence: Confidence,
  source: FieldSource,
});

export const ExtractionSchema = z.object({
  documentType: z.enum(["part_drawing", "spec_text", "unknown"]),
  drawingNumber: nullableStrField,
  drawingTitle: nullableStrField,
  units: z.object({
    value: z.enum(["in", "mm"]),
    confidence: Confidence,
    source: FieldSource,
  }),
  // The three overall bounding dimensions of the PART, in source units,
  // labeled as drawn. Downstream code treats them as an UNORDERED triple —
  // the LLM does NOT choose orientation; the rules engine does.
  envelope: z.object({
    a: numField, // typically the longest callout
    b: numField,
    c: numField, // typically the thickness callout
  }),
  material: z.object({
    rawText: z.string().nullable(),       // verbatim, e.g. "AL 7075-T651", "ATP-5"
    confidence: Confidence,
    source: FieldSource,
  }),
  quantity: z.object({
    value: z.number().int().positive().nullable(),
    confidence: Confidence,
    source: FieldSource,
  }),
  toleranceNotes: z.array(z.string()).max(20),   // captured verbatim, not interpreted
  flatnessCritical: z.object({
    value: z.boolean(),
    confidence: Confidence,
    source: FieldSource,
  }),
  ambiguities: z.array(z.string()).max(20),       // anything the model wasn't sure about
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export type ExtractionResult =
  | { ok: true; extraction: Extraction; inputType: "pdf" | "step" | "text" }
  | { ok: false; error: { stage: "render" | "llm" | "schema" | "parse";
      message: string; attempts: number } };
```

**Hard rules:**
- The LLM is prompted to output **only** JSON matching this schema (no prose, no markdown fences). The system prompt embeds the JSON Schema generated from Zod (`zod-to-json-schema`).
- The LLM never outputs alloy codes, prices, blank dimensions, or validity judgments. `material.rawText` is verbatim text; normalization is deterministic (§5.5).
- `inferred` source must pair with `low` or `medium` confidence — enforced with a Zod `.refine()`.

### 5.2 Path 1 — PDF part drawing (primary, the demo centerpiece)

1. Upload (Next.js route handler, `multipart/form-data`, max 10 MB, `.pdf` only). Persist to `/data/uploads/{quoteId}.pdf`.
2. Render pages to PNG at ~150 DPI using `pdf-to-img` (or `mupdf-js`); max 3 pages, downscale longest edge to 1568 px.
3. Send all page images in one Claude message (`claude-sonnet-4-6`, `max_tokens: 2000`, temperature 0) with the extraction system prompt. The system prompt instructs:
   - Read overall bounding dimensions from **dimension callouts** (the outermost extents), not by guessing from the picture's visual proportions. If extents must be summed or inferred, confidence is at most `medium` and source is `inferred`.
   - Read material from the **title block** verbatim.
   - Units from title block or note ("UNLESS OTHERWISE SPECIFIED DIMENSIONS ARE IN …"); if absent, infer from magnitude and mark `low`/`inferred`.
   - Quantity only if explicitly present; otherwise `null`.
   - List every uncertainty in `ambiguities`.
4. Parse response with `ExtractionSchema.safeParse`.
5. **Retry-on-schema-failure:** on failure, retry exactly once, appending the Zod validation error text and the model's previous raw output to the message with the instruction "Fix the JSON to satisfy the schema; change nothing else." On second failure, persist a quote with `status = extraction_failed`, render the error state (§8.2). **Never fabricate a quote.**

### 5.3 Path 2 — STEP file (geometric, no LLM)

1. Upload `.step`/`.stp`, max 25 MB. Persist to `/data/uploads/`.
2. Parse with `occt-import-js`; compute the axis-aligned bounding box across all solids.
3. Units: read the STEP header unit if exposed by the importer; default assumption **mm** (the common case), surfaced as a confirmable field in the UI before quoting ("Detected units: mm — change if wrong"). Convert to inches (÷25.4) at adapter exit.
4. Material comes from a required form field (alloy select + temper select populated from the catalog), `source: form_field`, `confidence: high`. Quantity from a form field, default 1.
5. Adapter emits the same `Extraction` shape: envelope `a/b/c` from AABB extents, `source: geometry`, `confidence: high`; `documentType: "unknown"` (the enum's reserved value for non-drawing inputs), with `ambiguities: ["envelope computed from STEP AABB; internal features ignored"]`.

### 5.4 Path 3 — text fallback

Paste a spec like `7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4`. Sent to `claude-sonnet-4-6` (text only, temperature 0) with the same schema and the same retry rule. `source` values are `user_text` or `inferred`. Dimensions are assumed inches unless the text says mm. Keeps the demo usable without files.

### 5.5 Deterministic material normalizer (`src/rules/normalizeMaterial.ts`)

Pure function; no LLM. Uppercase, strip punctuation/whitespace, then match against an explicit table (longest match wins):

| pattern (regex, case-insensitive) | alloyCode | temper |
|---|---|---|
| `7075[- ]?T651` | 7075 | T651 |
| `7075[- ]?T7351` | 7075 | T7351 |
| `7075` (alone) | 7075 | null |
| `6061[- ]?T6511` | 6061 | T6511 |
| `6061[- ]?(T6\b|T651)` | 6061 | T651 (T6 maps to default T651, **assumption recorded**) |
| `6061` | 6061 | null |
| `7050[- ]?T7451` / `T7651` / alone | 7050 | per match / null |
| `5052` / `5083` / `5086` | respective | null |
| `ATP[- ]?5`, `CAST (TOOL|T ?& ?J)`, `JIG PLATE`, `MIC[- ]?6` | CAST_TJ | null |
| `INCONEL ?625` / `625` with `INCONEL` context | INCONEL_625 | — |
| `INCONEL ?718` | INCONEL_718 | — |
| `(304|316|17[- ]?4 ?PH).*(SS|STAINLESS)` or reverse order | SS_* | — |
| `STEEL`, `TITANIUM`, `TI[- ]?6AL[- ]?4V`, `4140`, `A36`, … | special code `OTHER_METAL` | — |
| no match, non-null rawText | `UNRECOGNIZED` | — |
| rawText null | `UNSPECIFIED` | — |

Outcome mapping (deterministic):
- `standard` alloy + temper → proceed.
- `standard` alloy, temper null → apply `defaultTemper`, add assumption `TEMPER_DEFAULTED`.
- `by_request` alloy or `OTHER_METAL` → issue `BY_REQUEST_MATERIAL` (severity `review`), **no price**, status `needs_review`.
- `UNRECOGNIZED` → issue `MATERIAL_UNRECOGNIZED` (severity `review`), no price.
- `UNSPECIFIED` → recommend the **cheapest qualifying alloy**: among standard alloys whose thickness range covers the snapped blank thickness, pick the lowest `ratePerLb` at that thickness (ties → lower density). Add assumption `ALLOY_RECOMMENDED` rendered **prominently as a recommendation, not an extraction**, plus issue severity `review` so the quote is priced but flagged `needs_review`.

### 5.6 Confidence → behavior mapping (deterministic)

| condition | behavior |
|---|---|
| any envelope dim or units `low` confidence | price is still computed, but issue `LOW_CONFIDENCE_DIMENSION` (review) → status `needs_review`; banner "verify before use" |
| material confidence `low` (but normalizer matched) | assumption + review issue `LOW_CONFIDENCE_MATERIAL` |
| quantity null | qty = 1, assumption `QTY_DEFAULTED` |
| `flatnessCritical.value === true` | assumption note "flatness callout present — cast tool & jig plate may be preferred"; no price effect in v1 |
| any `ambiguities` entries | rendered verbatim in the amber panel |

Status precedence: `rejected` > `needs_review` > `priced`.

---

## 6. Envelope → blank rules layer (pure functions, `src/rules/`)

All functions pure and synchronous; inputs/outputs are Zod-typed; no DB or network access (catalog rows are passed in). This is the layer Vitest hits hardest.

### 6.1 Definitions and defaults

- `sideAllowanceIn` — machining allowance added **per side** on the two plan dimensions (length and width). Default **0.125"/side** (so +0.25" total per dimension). User-adjustable in the intake UI (0–0.5", step 0.0625).
- `minThicknessCleanupIn` — minimum total cleanup stock on thickness. Default **0.1"**. User-adjustable (0–0.5", step 0.05).
- Thickness is never milled from arbitrary stock: blank thickness **snaps UP** to the nearest stocked increment ≥ `partThickness + minThicknessCleanupIn`, restricted to the alloy's `[min, max]` range.

### 6.2 Orientation search

The part envelope is an unordered triple `(d1, d2, d3)`. For each of the 3 axis orientations (each dimension takes a turn as the thickness axis; the other two are plan dims):

1. `requiredT = tDim + minThicknessCleanupIn`
2. `blankT = smallest stocked thickness ≥ requiredT within alloy range` — if none, orientation **invalid** (`reason: "no stocked thickness covers required ${requiredT}"`).
3. `blankW = min(planDims) + 2 × sideAllowanceIn`, `blankL = max(planDims) + 2 × sideAllowanceIn`.
4. Stock fit: invalid if `blankW > 60` or `blankL > 144` (`reason: "exceeds largest stock plate 60×144"`).
5. `volume = blankT × blankW × blankL`.

**Choose** the valid orientation with the lowest volume (volume is a faithful cost proxy since rate varies only with thickness, which the search already captures — document this). Tie-breaks: lower `blankT`, then lower `blankL`. If **no** orientation is valid → issue `NO_VALID_BLANK` severity `reject`, status `rejected`, no price. The quote page shows **all three candidates** with their volumes/validity and a one-line reason for the choice.

DFARS toggle does not change geometry; it changes sourcing label + material price (§7).

### 6.3 Worked example 1 — clean

Part: **6061-T6**, 11.5 × 5.0 × 0.9 in, qty 2. Defaults (0.125"/side, 0.1" cleanup).

- Normalizer: 6061, T6 → default temper **T651**, assumption `TEMPER_DEFAULTED`.
- Orientation with thickness axis = 0.9: required 1.0 → snaps exactly to stocked **1.0"**. Plan: 11.5→**11.75**, 5.0→**5.25**. Volume = 1.0 × 5.25 × 11.75 = **61.6875 in³**.
- Alternatives: t-axis = 5.0 → required 5.1 → snap 6.0, volume 6.0 × 1.15 × 11.75 = 81.075 (worse). t-axis = 11.5 → required 11.6 > 10.0 max → invalid.
- **Chosen blank: 1.0" × 5.25" × 11.75", 6061-T651** — fits 48×96 stock. Status `priced` (one amber assumption).

### 6.4 Worked example 2 — thickness snap + non-obvious orientation

Part: **6061-T651**, 4.0 × 3.8 × 3.6 in, qty 1.

| t-axis | requiredT | blankT (snap) | plan dims | blankW × blankL | volume (in³) |
|---|---|---|---|---|---|
| 3.6 | 3.7 | 4.0 | 4.0, 3.8 | 4.05 × 4.25 | 4.0 × 4.05 × 4.25 = **68.85** |
| **3.8** | 3.9 | **4.0** | 4.0, 3.6 | 3.85 × 4.25 | 4.0 × 3.85 × 4.25 = **65.45** ✅ |
| 4.0 | 4.1 | 5.0 | 3.8, 3.6 | 3.85 × 4.05 | 5.0 × 3.85 × 4.05 = 77.96 |

Both of the first two snap to the same 4.0" plate, so the smaller plan footprint wins: **chosen blank 4.0" × 3.85" × 4.25"** with t-axis on the 3.8" dimension — *not* the smallest part dimension. This is exactly why the orientation search exists; the quote page must display this table.

---

## 7. Pricing + lead-time engine (deterministic, `src/pricing/`)

All values invented-but-plausible. All math in this section is normative, including rounding order. Money is computed in **cents** with explicit half-up rounding at the steps marked ⚙; everything between ⚙ steps uses full float precision.

### 7.1 Formulas (per line)

```
1.  volumePerPiece = blankT × blankW × blankL                       (in³)
2.  weightLb       = volumePerPiece × density(alloy) × qty          ⚙ round to 2 decimals
3.  ratePerLb      = basePerLb(alloy) + 0.02 × thicknessIndex(blankT)
4.  materialBase   = weightLb × ratePerLb                           ⚙ cents
5.  dfarsAdder     = dfars ? materialBase × 0.12 : 0                ⚙ cents   (+12% on material)
6.  cuttingPerPc   = 4 × (4.00 + 3.50 × blankT)                     ⚙ cents   (4 cuts per piece)
7.  cutting        = cuttingPerPc × qty
8.  qtyBreakRate   = qty ≥ 25 ? 0.12 : qty ≥ 10 ? 0.07 : qty ≥ 5 ? 0.04 : 0
9.  qtyDiscount    = (materialBase + dfarsAdder + cutting) × qtyBreakRate   ⚙ cents (negative line)
10. setup          = $25.00 × (number of distinct alloy+blankT groups on the quote; v1 = 1)
11. lineSubtotal   = materialBase + dfarsAdder + cutting − qtyDiscount + setup
12. margin         = lineSubtotal × 0.18                            ⚙ cents
13. lineTotal      = lineSubtotal + margin
14. if lineTotal < $45.00 → add visible "Line minimum adjustment" = 45.00 − lineTotal; lineTotal = 45.00
```

Order level:

```
15. orderSubtotal = Σ lineTotal
16. if orderSubtotal < $120.00 → add visible "Order minimum adjustment" line = 120.00 − orderSubtotal
17. orderTotal = max(orderSubtotal, 120.00)
```

The price book row used is the one with `effectiveDate ≤ quoteDate < expiresDate` (or open); its id is persisted in the breakdown for reproducibility.

### 7.2 Lead time

```
days = 2                          (base, business days)
     + (blankT > 4.0 ? 1 : 0)
     + (any line qty > 10 ? 1 : 0)
     + (dfars ? 2 : 0)
shipDate = quoteDate advanced by `days` business days (skip Sat/Sun; no holiday calendar in v1)
validUntil = quoteDate + 14 calendar days
```

### 7.3 Fully worked example (a reviewer must be able to recompute this by hand)

Input (text fixture T1): `7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4`, DFARS off, default allowances.

**Blank (rules layer):** t-axis 1.1 → required 1.2 → snap **1.25"** (alternatives: t-axis 3.2 → 3.3 → snap 4.0, blank 4.0 × 1.35 × 7.75 = 41.85 in³; t-axis 7.5 → 7.6 → snap 8.0 > 7075 max 6.0 → invalid). Plan: 7.5→7.75, 3.2→3.45. **Chosen blank: 1.25 × 3.45 × 7.75, volume 33.421875 in³.**

| step | computation | value |
|---|---|---|
| weight | 33.421875 × 0.1019 × 4 = 13.62276 → round | **13.62 lb** |
| rate | 6.40 + 0.02 × idx(1.25 = 5) | **$6.50/lb** |
| material | 13.62 × 6.50 | **$88.53** |
| DFARS | off | $0.00 |
| cutting/pc | 4 × (4.00 + 3.50 × 1.25) = 4 × 8.375 | **$33.50** |
| cutting | 33.50 × 4 | **$134.00** |
| qty break | qty 4 < 5 | $0.00 |
| setup | 1 group | **$25.00** |
| line subtotal | 88.53 + 134.00 + 25.00 | **$247.53** |
| margin 18% | 247.53 × 0.18 = 44.5554 → round | **$44.56** |
| **line total** | | **$292.09** |
| order minimum | 292.09 ≥ 120 | no adjustment |
| **order total** | | **$292.09** |

Lead time: blankT 1.25 ≤ 4, qty 4 ≤ 10, no DFARS → **2 business days**. Validity 14 days. This exact table is a Vitest snapshot **and** appears in the README.

### 7.4 Breakdown JSON shape (persisted + rendered)

```ts
{
  priceBookId: string,
  inputs: { blank: {t,w,l}, densityLbIn3, qty, dfars, ratePerLb, thicknessIndex },
  linesCents: {
    material: number, dfarsAdder: number, cutting: number, cuttingPerPiece: number,
    qtyDiscount: number, qtyBreakRate: number, setup: number,
    lineSubtotal: number, margin: number, lineMinAdjustment: number, lineTotal: number
  },
  orderCents: { subtotal: number, orderMinAdjustment: number, total: number },
  weightLb: number,
  leadTime: { days: number, contributors: string[], shipDate: string },
  validUntil: string
}
```

Every number the UI shows comes from this object — the UI performs **no arithmetic**.

---

## 8. UI pages (Next.js App Router; dark industrial aesthetic; `font-mono` for all numbers)

### 8.1 `/` — intake

- Three tabs: **Drawing (PDF)** / **STEP** / **Paste spec**.
- Fixture chips one click away under each tab: "Try: clean 7075 drawing", "metric / missing temper", "316 stainless (manual review)", "oversize (rejection)", the STEP block, two text fixtures. Clicking loads the fixture and runs the pipeline.
- Settings panel (collapsible): side allowance (default 0.125), thickness cleanup (default 0.1), **DFARS/domestic-only toggle**, quantity override.
- STEP tab additionally requires alloy + temper selects and shows the detected-units confirm.
- Submit → spinner with stage progress ("Rendering → Extracting → Validating → Pricing") → redirect to `/quotes/[id]`.

### 8.2 `/quotes/[id]` — shareable quote page

- **Header:** quote id, status badge (`priced` green / `needs_review` red-outline / `rejected` red / `extraction_failed` gray), created date, **valid until**, **ship date** (priced only), DFARS badge if on.
- **Extracted-fields panel:** every extraction field with value, confidence pill (high/medium/low color-coded), and source ("title block", "dimension callout", "geometry", …). Raw material text shown verbatim next to the normalized alloy/temper.
- **Assumptions panel (amber):** each `assumption` as a sentence, e.g. "Temper not specified — applied catalog default T651." The cheapest-alloy recommendation renders here with extra prominence ("RECOMMENDED, not extracted").
- **Needs-review / rejection panel (red):** each `issue` with its reason; for `by_request` materials: "316 stainless is by-request — routed to manual review, no automated price."
- **Envelope→blank visual:** side-by-side SVG — part envelope box and recommended blank box to shared scale, dims labeled, allowance shading on the delta; below it, the 3-orientation candidate table from §6.2 with the chosen row highlighted and the reason.
- **Quote line:** alloy/temper, blank dims, qty, line total; **expandable cost breakdown** rendering every row of §7.4 including discount/adjustment lines, plus weight and $/lb so the math is hand-checkable.
- **Footer:** non-affiliation disclaimer (§13.3), "Quote is demo data — not a real offer."
- `extraction_failed` state: the stage that failed, the validation error, raw model output in a collapsed `<details>`, and a "try again" link. No numbers anywhere.

### 8.3 `/quotes` — list

Table: id (link), created, input type, status badge, material, blank, total. Newest first. Empty state points at the fixtures.

---

## 9. Fixtures (`scripts/generate-fixtures.ts`, run by seed)

PDF drawings are **generated programmatically** with `pdf-lib`: white page, border, dimensioned rectangle views (front + side) with extension/dimension lines and arrowheads, notes block, and a bottom-right title block (TITLE, DWG NO, MATERIAL, UNITS, QTY, REV). They must be unambiguous enough for vision extraction yet look like real shop drawings.

| id | file | contents | expected pipeline outcome |
|---|---|---|---|
| **A** | `fixtures/A-bracket-7075.pdf` | Title "MOUNTING BRACKET", DWG NO FC-1001, MATERIAL `AL 7075-T651`, UNITS INCHES, QTY 4, callouts 7.50 / 3.20 / 1.10 | `priced`, blank 1.25×3.45×7.75, total **$292.09** (§7.3), 2-day lead |
| **B** | `fixtures/B-plate-metric.pdf` | Title "SPACER PLATE", MATERIAL `AL 6061` (no temper), UNITS MM, callouts 190 / 85 / 22, no qty | `priced` with assumptions: temper→T651, qty→1; converted 7.480×3.346×0.866 in; blank 1.0×3.596×7.730 |
| **C** | `fixtures/C-manifold-316ss.pdf` | MATERIAL `316 STAINLESS STEEL`, inches, 6.00 / 4.00 / 1.50, QTY 2 | `needs_review`, `BY_REQUEST_MATERIAL`, **no price shown** |
| **D** | `fixtures/D-rail-oversize.pdf` | MATERIAL `AL 6061-T6`, inches, 150.0 / 20.0 / 1.00, QTY 1 | `rejected`, `NO_VALID_BLANK` ("exceeds largest stock plate 60×144" / thickness range), all 3 orientations shown invalid |
| **S** | `fixtures/S-block.step` | rectangular block 152.4 × 101.6 × 25.4 mm (6×4×1 in). Authored so `occt-import-js` parses it and the AABB computes to 6×4×1 in ± 0.01. | with form: 6061/T651, qty 5 → `priced`, qty break 4% applies |
| **T1** | text | `7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4` | identical to the §7.3 worked example |
| **T2** | text | `need 12 pcs 5083 plate blanks for a marine bracket, 18 x 6 x 0.6 finished` | `priced`; temper default assumption; qty 12 → 7% break **and** +1 lead day |
| **T3** | text | `asdf give me a quote for vibes` | graceful degradation: extraction returns nulls/low confidence → `needs_review` or `extraction_failed`; never a price |

Text fixtures live in `fixtures/text-fixtures.json` and power both the UI chips and integration tests.

---

## 10. Acceptance criteria (v1 — all must pass before the nesting stretch starts)

1. `npm i && npm run seed && npm run dev` works from a clean checkout with only `ANTHROPIC_API_KEY` set; seed generates DB + all fixtures.
2. Fixture **A** through the UI produces a `priced` quote whose line total is **exactly $292.09** with the §7.3 breakdown, ship date = quote date + 2 business days, validity 14 days.
3. Fixture **B** prices with exactly two amber assumptions (temper default, qty default) and correct mm→in conversion (each dim within ±0.005 in).
4. Fixture **C** reaches `needs_review` with the by-request issue and **renders no dollar amounts**.
5. Fixture **D** reaches `rejected`, shows all three orientation candidates as invalid with reasons, renders no price.
6. STEP fixture yields AABB 6×4×1 in (±0.01), and with form inputs 6061-T651 / qty 5 produces a priced quote including a visible −4% quantity-break line.
7. Text fixtures T1/T2 behave per the table; **T3 (nonsense) degrades gracefully** — structured flags or error state, never a fabricated number.
8. **Hand-recomputability:** every displayed dollar figure on any priced quote equals the value derivable from the displayed weight, $/lb, formulas, and adjustment lines (Vitest property: breakdown internally consistent to the cent for randomized valid inputs).
9. **No unvalidated LLM output ever reaches pricing:** the pricing module's only entry point accepts the post-Zod, post-normalizer types; grep-level check that `src/pricing/` and `src/rules/` import nothing from the Anthropic SDK.
10. Schema-failure path: a forced malformed LLM response (mocked in tests) triggers exactly one retry, then the error state.
11. Quotes persist: reloading `/quotes/[id]` after server restart renders identically from the DB; `/quotes` lists all of the above.
12. Vitest green: rules layer (orientation table of §6.4 asserted exactly), pricing (§7.3 snapshot, qty-break boundaries 4/5, 9/10, 24/25, DFARS, line/order minimums, lead-time matrix, weekend-skipping ship date), material normalizer table.
13. Non-affiliation disclaimer present in README and in the footer of every page.

---

## 11. Testing strategy (write these BEFORE UI)

- `src/rules/__tests__/` — orientation search (incl. §6.3/§6.4 exact tables), snap edge cases (`requiredT` exactly equals a stocked value; above alloy max; CAST_TJ 4" cap), allowance overrides, normalizer pattern table (every row), cheapest-alloy recommendation determinism.
- `src/pricing/__tests__/` — §7.3 worked example asserted to the cent; rounding-order regression (assert intermediate `materialBase` cents, not just total); qty-break boundaries; DFARS +12% applies to material only; minimums render as adjustment lines; lead time + ship date across a weekend (e.g., quote Friday → +2 biz days = Tuesday).
- `src/extraction/__tests__/` — Zod schema accepts/rejects crafted payloads; `inferred`+`high` refinement rejected; retry logic with a mocked Anthropic client (no live API in tests).
- One integration test per fixture path with the LLM mocked to canned extractions (live-API e2e is a manual script `npm run e2e:live`, not CI).

---

## 12. Stretch: inventory-aware guillotine nesting (build only after §10 passes)

- **Algorithm:** per alloy+thickness group, sort blanks descending by area; shelf-based first-fit-decreasing guillotine placement onto `available` plates of that alloy+thickness, preferring remnants over full sheets, smaller plates over larger. Cuts are full guillotine (edge-to-edge); blanks may rotate 90°.
- **Yield-based material cost:** `nestedMaterialCost = consumedAreaIn² × blankT × density × ratePerLb`, where consumed area = the guillotine strips actually severed for this job, minus any off-cut ≥ 6"×6" returned to inventory (those areas are credited at 100% of the same rate). Display effective yield % = blank area ÷ net consumed area.
- **Remnants:** returned off-cuts insert into `plates` with `isRemnant=1`, `parentPlateId`, `status='available'`; consumed plates flip to `consumed`.
- **UI:** SVG nest visualization (plate outline, placed blanks labeled, returned remnants hatched) on the quote page; a "Simple vs Nested pricing" toggle showing both totals side by side with the delta.
- **Acceptance:** a deterministic seeded scenario test where nesting against a known remnant beats simple pricing by a computable amount; remnant rows verifiably created; simple pricing remains byte-identical to v1 outputs when the toggle is off.

---

## 13. Repo structure, README, disclaimer

### 13.1 Repo structure

```
/PRD.md                      (this file)
/README.md
/fixtures/                   (generated by seed)
/scripts/seed.ts
/scripts/generate-fixtures.ts
/scripts/e2e-live.ts
/data/                       (gitignored: sqlite db, uploads)
/src/db/schema.ts            /src/db/client.ts
/src/extraction/schema.ts    /src/extraction/pdf.ts  step.ts  text.ts  prompt.ts
/src/rules/normalizeMaterial.ts  computeBlank.ts  catalog.ts
/src/pricing/price.ts  leadTime.ts
/src/nesting/                (stretch)
/src/app/page.tsx  /src/app/quotes/[id]/page.tsx  /src/app/quotes/page.tsx
/src/app/api/quote/route.ts
/src/components/...
```

### 13.2 README requirements

- Architecture diagram (Mermaid) of the **extract / price split** — the LLM zone vs deterministic zone exactly as in §3.
- Quickstart (`npm i && npm run seed && npm run dev`), env var table.
- The §7.3 worked example, verbatim, with an invitation to recompute it by hand.
- **"What's dummy vs grounded"** table: grounded in Nox's public materials page = alloy list/tempers/thickness ranges, stock plate sizes, thickness increments, densities; invented = all prices, formulas, lead times, margins, plate inventory.
- Honest **"What v2 would need"** section: real price feeds with effective-dated books per supplier; integration with actual nesting/inventory (this is where Nox Nest already wins); GD&T-aware extraction (datums, flatness driving cast-plate selection); non-rectangular blanks; multi-part drawings and assemblies; drawing-revision diffing; auth + ERP hooks; human-in-the-loop review queue for `needs_review` quotes; evaluation harness for extraction accuracy across a real drawing corpus.
- Non-affiliation disclaimer at the top.

### 13.3 Non-affiliation disclaimer (verbatim, README top + UI footer)

> FirstCut is an independent, unaffiliated demonstration project inspired by publicly available information about Nox Metals. It is not built by, endorsed by, or connected to Nox Metals in any way. All prices, formulas, inventory, and lead times are fictitious demo data and do not represent real offers, real pricing, or Nox Metals' actual systems.

---

## 14. Demo script (~2 minutes, Nox engineering audience)

1. *"Gondor starts when a buyer pastes a blank spec. But upstream of every one of those specs is a part drawing, and a human did the part→blank translation. **FirstCut starts quoting from the drawing — one step earlier than your current intake.**"*
2. Click fixture A. Watch stages: render → extract → validate → price. Land on the quote.
3. Point at the extracted-fields panel: *"Claude only extracted — every field has a confidence and a source. It never touched a price."*
4. Expand the breakdown: *"Every dollar recomputes by hand: 13.62 lb × $6.50, plus 4 cuts at $33.50 a piece, $25 setup, 18% margin — $292.09."* Show the orientation table: *"It also chose the blank orientation deterministically and shows the two it rejected."*
5. Click fixture B: metric drawing, missing temper → amber assumptions, not silent guesses.
6. Click fixture C: 316 stainless → routed to manual review, no price. *"The LLM can't talk the pricer into quoting something the catalog says is by-request."*
7. Click fixture D: oversize part → clean rejection with reasons.
8. Close: *"The architecture is the pitch: LLM at the edge, deterministic core, every uncertainty surfaced. Bolt this in front of Gondor and the RFQ starts at the CAD file."*

---

## 15. Build sequencing (instruction to Claude Code — follow strictly)

1. Scaffold Next.js + Drizzle + schema + seed (catalog, price book, thicknesses).
2. **Write rules-layer and pricing tests first** (encode §6.3, §6.4, §7.3 exactly), then implement `src/rules/` and `src/pricing/` until green.
3. Extraction schema + adapters with mocked-LLM tests; then live prompt + retry logic.
4. Fixture generator; verify fixture A round-trips to $292.09 via `npm run e2e:live`.
5. UI pages, persistence, fixture chips.
6. Verify **every** §10 acceptance criterion. Only then begin §12 nesting. If any earlier section conflicts with an acceptance criterion, the acceptance criterion wins.