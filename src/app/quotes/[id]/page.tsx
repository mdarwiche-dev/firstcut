// Shareable quote page (§8.2). Renders entirely from persisted rows — reload
// after server restart must be identical (§10.11).
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadQuote } from "@/quote/persist";
import { alloyByCode } from "@/rules/catalog";
import { fmtCents, fmtDate } from "@/lib/format";
import {
  AmbiguitiesPanel,
  AssumptionsPanel,
  BreakdownTable,
  EnvelopeBlankSvg,
  FieldRow,
  IssuesPanel,
  MetaRow,
  OrientationTable,
  StatusBadge,
} from "@/components/quote-panels";
import { NestPanel } from "@/components/nest-panel";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = loadQuote(id);
  if (!quote) notFound();

  const extraction = quote.extraction;
  const line = quote.line;

  // §8.2 extraction_failed state: failure details, no numbers anywhere.
  if (quote.status === "extraction_failed" || !extraction.ok) {
    const err = extraction.ok ? null : extraction.error;
    return (
      <div className="space-y-6">
        <Header quote={quote} />
        <section className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-5">
          <h2 className="text-sm font-semibold text-neutral-300">Extraction failed</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Failed at stage <span className="num text-red-400">{err?.stage ?? "unknown"}</span>
            {err ? ` after ${err.attempts} attempt${err.attempts === 1 ? "" : "s"}` : ""}.
          </p>
          {err?.message && (
            <pre className="mt-3 overflow-x-auto rounded bg-neutral-950 p-3 text-xs text-red-300/90 whitespace-pre-wrap">
              {err.message}
            </pre>
          )}
          {err?.raw && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
                Raw model output (final attempt)
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-neutral-950 p-3 text-xs text-neutral-400 whitespace-pre-wrap">
                {err.raw}
              </pre>
            </details>
          )}
          <Link href="/" className="mt-4 inline-block rounded bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-500">
            Try again
          </Link>
        </section>
      </div>
    );
  }

  const ex = extraction.extraction;
  const alloy = line?.alloyCode ? alloyByCode(line.alloyCode) : null;
  const showPrice = line?.breakdown != null && quote.status !== "rejected";

  return (
    <div className="space-y-6">
      <Header quote={quote} />

      {line && <AssumptionsPanel assumptions={line.assumptions} />}
      {line && <IssuesPanel issues={line.issues} />}
      <AmbiguitiesPanel ambiguities={ex.ambiguities} />

      {/* Extracted fields (§8.2) */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Extracted fields — value · confidence · source
        </h2>
        <div className="mt-3">
          <FieldRow label="Document type" field={{ value: ex.documentType, confidence: "high", source: extraction.inputType === "step" ? "geometry" : "title_block" }} />
          <FieldRow label="Drawing number" field={ex.drawingNumber} />
          <FieldRow label="Drawing title" field={ex.drawingTitle} />
          <FieldRow label="Units" field={ex.units} />
          <FieldRow label="Envelope a" field={ex.envelope.a} suffix={` ${ex.units.value}`} />
          <FieldRow label="Envelope b" field={ex.envelope.b} suffix={` ${ex.units.value}`} />
          <FieldRow label="Envelope c" field={ex.envelope.c} suffix={` ${ex.units.value}`} />
          <FieldRow
            label="Material (verbatim)"
            field={{ value: ex.material.rawText, confidence: ex.material.confidence, source: ex.material.source }}
          />
          {line?.alloyCode && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-neutral-500">→ normalized (deterministic)</span>
              <span className="num text-sm text-orange-300">
                {alloy?.name ?? line.alloyCode}{line.temper ? ` — ${line.temper}` : ""}
              </span>
            </div>
          )}
          <FieldRow label="Quantity" field={ex.quantity} />
          <FieldRow label="Flatness critical" field={ex.flatnessCritical} />
          {ex.toleranceNotes.length > 0 && (
            <div className="py-1.5">
              <span className="text-xs text-neutral-500">Tolerance notes (verbatim, not interpreted)</span>
              <ul className="mt-1 list-disc pl-5 text-sm text-neutral-300">
                {ex.toleranceNotes.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Envelope → blank visual + orientation candidates (§8.2) */}
      {line?.partEnvelope && line.orientations?.length > 0 && (
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Envelope → blank
          </h2>
          {line.blank && (
            <div className="mt-3">
              <EnvelopeBlankSvg envelope={line.partEnvelope} blank={line.blank} />
            </div>
          )}
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Orientation search — all 3 candidates
          </h3>
          <div className="mt-2">
            <OrientationTable candidates={line.orientations} />
          </div>
        </section>
      )}

      {/* Quote line + expandable breakdown (§8.2) */}
      {line && showPrice && line.breakdown && (
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-neutral-200">
              {alloy?.name ?? line.alloyCode}{line.temper ? ` ${line.temper}` : ""} · blank{" "}
              <span className="num">
                {line.blank.thicknessIn}" × {round3(line.blank.widthIn)}" × {round3(line.blank.lengthIn)}"
              </span>{" "}
              · qty <span className="num">{line.qty}</span>
            </h2>
            <span className="num text-xl font-bold text-orange-400">{fmtCents(line.breakdown.orderCents.total)}</span>
          </div>
          <details className="mt-3" open>
            <summary className="cursor-pointer text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300">
              Cost breakdown — hand-recomputable
            </summary>
            <div className="mt-3">
              <BreakdownTable breakdown={line.breakdown} qty={line.qty} />
            </div>
          </details>
        </section>
      )}

      {/* Stretch §12: simple vs nested pricing */}
      {line && showPrice && line.nesting && (
        <NestPanel nesting={line.nesting} simpleTotalCents={line.breakdown.orderCents.total} />
      )}
    </div>
  );
}

function Header({ quote }: { quote: NonNullable<ReturnType<typeof loadQuote>> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="flex items-center gap-4">
        <h1 className="num text-lg font-semibold">#{quote.id}</h1>
        <StatusBadge status={quote.status} />
        {quote.settings?.dfars && (
          <span className="rounded-full border border-sky-800 bg-sky-950 px-3 py-0.5 text-xs uppercase tracking-wider text-sky-300">
            DFARS
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-6">
        <MetaRow label="Created" value={fmtDate(quote.createdAt)} />
        <MetaRow label="Valid until" value={fmtDate(quote.validUntil)} />
        {quote.shipDate && <MetaRow label="Ship date" value={fmtDate(quote.shipDate)} />}
        <MetaRow label="Input" value={quote.inputType.toUpperCase()} />
      </div>
    </div>
  );
}

function round3(v: number): number {
  return Number(v.toFixed(3));
}
