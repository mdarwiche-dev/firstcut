// Server-renderable presentational components for /quotes/[id] (§8.2).
// Every number shown comes from persisted JSON — no arithmetic here.
import { fmtCents, fmtDate, fmtIn } from "@/lib/format";
import type { OrientationCandidate } from "@/rules/computeBlank";
import type { Breakdown } from "@/pricing/price";
import type { Assumption, Issue } from "@/quote/assemble";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    priced: "bg-green-950 text-green-400 border-green-800",
    needs_review: "bg-transparent text-red-400 border-red-700",
    rejected: "bg-red-950 text-red-300 border-red-800",
    extraction_failed: "bg-neutral-800 text-neutral-400 border-neutral-700",
  };
  return (
    <span className={`rounded-full border px-3 py-0.5 text-xs font-medium uppercase tracking-wider ${styles[status] ?? styles.extraction_failed}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function ConfidencePill({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: "bg-green-950/60 text-green-400",
    medium: "bg-amber-950/60 text-amber-400",
    low: "bg-red-950/60 text-red-400",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${styles[confidence] ?? ""}`}>
      {confidence}
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  title_block: "title block",
  dimension_callout: "dimension callout",
  notes: "notes",
  user_text: "pasted text",
  geometry: "geometry",
  form_field: "form field",
  inferred: "inferred",
};

interface ExtractedField {
  value: unknown;
  confidence: string;
  source: string;
}

export function FieldRow({ label, field, suffix }: { label: string; field: ExtractedField; suffix?: string }) {
  const display =
    field.value === null || field.value === undefined || field.value === ""
      ? "—"
      : String(field.value) + (suffix ?? "");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-800/60 py-1.5 last:border-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className="num text-sm text-neutral-200">{display}</span>
        <ConfidencePill confidence={field.confidence} />
        <span className="w-28 text-right text-[10px] text-neutral-500">
          {SOURCE_LABELS[field.source] ?? field.source}
        </span>
      </span>
    </div>
  );
}

export function AssumptionsPanel({ assumptions }: { assumptions: Assumption[] }) {
  if (!assumptions.length) return null;
  return (
    <section className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-500">Assumptions</h2>
      <ul className="mt-2 space-y-1.5">
        {assumptions.map((a, i) => (
          <li key={i} className={`text-sm ${a.code === "ALLOY_RECOMMENDED" ? "font-semibold text-amber-300" : "text-amber-200/90"}`}>
            {a.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IssuesPanel({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <section className="rounded-lg border border-red-900/60 bg-red-950/20 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400">
        Needs review / rejection
      </h2>
      <ul className="mt-2 space-y-1.5">
        {issues.map((iss, i) => (
          <li key={i} className="text-sm text-red-200/90">
            <span className="mr-2 rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] uppercase">{iss.severity}</span>
            {iss.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AmbiguitiesPanel({ ambiguities }: { ambiguities: string[] }) {
  if (!ambiguities.length) return null;
  return (
    <section className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-500">
        Extractor ambiguities (verbatim)
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200/90">
        {ambiguities.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </section>
  );
}

export function OrientationTable({ candidates }: { candidates: OrientationCandidate[] }) {
  if (!candidates.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="py-2 pr-3">t-axis dim</th>
            <th className="py-2 pr-3">required t</th>
            <th className="py-2 pr-3">blank t (snap)</th>
            <th className="py-2 pr-3">blank w × l</th>
            <th className="py-2 pr-3">volume (in³)</th>
            <th className="py-2">outcome</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr
              key={i}
              className={`border-b border-neutral-800/60 last:border-0 ${c.chosen ? "bg-green-950/30 text-green-200" : c.valid ? "" : "text-neutral-500"}`}
            >
              <td className="num py-2 pr-3">{fmtIn(c.tAxisDim)}</td>
              <td className="num py-2 pr-3">{fmtIn(c.requiredT)}</td>
              <td className="num py-2 pr-3">{c.blankT != null ? fmtIn(c.blankT) : "—"}</td>
              <td className="num py-2 pr-3">{fmtIn(c.blankW)} × {fmtIn(c.blankL)}</td>
              <td className="num py-2 pr-3">{c.volumeIn3 != null ? c.volumeIn3.toFixed(3) : "—"}</td>
              <td className="py-2 text-xs">
                {c.chosen ? <span className="font-semibold text-green-400">CHOSEN — {c.reason}</span>
                  : c.valid ? "valid"
                  : <span className="text-red-400/80">invalid — {c.reason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EnvelopeBlankSvg({
  envelope,
  blank,
}: {
  envelope: { lengthIn: number; widthIn: number; thicknessIn: number };
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
}) {
  // Plan view (L × W) of part and blank to shared scale; allowance shaded.
  const pad = 14;
  const w = 460;
  const h = 200;
  const scale = Math.min((w / 2 - pad * 2) / blank.lengthIn, (h - pad * 2 - 24) / blank.widthIn);
  const eW = envelope.lengthIn * scale;
  const eH = envelope.widthIn * scale;
  const bW = blank.lengthIn * scale;
  const bH = blank.widthIn * scale;
  const cx1 = w / 4;
  const cx2 = (3 * w) / 4;
  const cy = (h - 24) / 2 + 4;

  const label = (x: number, y: number, t: string, cls = "fill-neutral-400") => (
    <text x={x} y={y} textAnchor="middle" className={`num ${cls}`} fontSize={10}>{t}</text>
  );

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-xl">
      {/* part envelope */}
      <rect x={cx1 - eW / 2} y={cy - eH / 2} width={eW} height={eH}
        className="fill-neutral-800 stroke-neutral-400" strokeWidth={1.2} />
      {label(cx1, cy - eH / 2 - 6, `part ${fmt3(envelope.lengthIn)} × ${fmt3(envelope.widthIn)} × ${fmt3(envelope.thicknessIn)}`)}
      {label(cx1, h - 6, "PART ENVELOPE", "fill-neutral-500")}

      {/* blank with allowance shading: outer = blank, inner = part footprint */}
      <rect x={cx2 - bW / 2} y={cy - bH / 2} width={bW} height={bH}
        className="fill-orange-500/20 stroke-orange-500" strokeWidth={1.2} />
      <rect x={cx2 - eW / 2} y={cy - eH / 2} width={eW} height={eH}
        className="fill-neutral-800 stroke-neutral-500" strokeWidth={0.8} strokeDasharray="3 2" />
      {label(cx2, cy - bH / 2 - 6, `blank ${fmt3(blank.lengthIn)} × ${fmt3(blank.widthIn)} × ${fmt3(blank.thicknessIn)}`, "fill-orange-400")}
      {label(cx2, h - 6, "RECOMMENDED BLANK (allowance shaded)", "fill-neutral-500")}
    </svg>
  );
}

function fmt3(v: number): string {
  return String(Number(v.toFixed(3)));
}

export function BreakdownTable({ breakdown, qty }: { breakdown: Breakdown; qty: number }) {
  const L = breakdown.linesCents;
  const O = breakdown.orderCents;
  const rows: Array<[string, string, string] | null> = [
    [
      "Material",
      `${breakdown.weightLb} lb × ${fmtCents(Math.round(breakdown.inputs.ratePerLb * 100))}/lb (thickness index ${breakdown.inputs.thicknessIndex})`,
      fmtCents(L.material),
    ],
    L.dfarsAdder > 0 ? ["DFARS adder", "+12% on material", fmtCents(L.dfarsAdder)] : null,
    [
      "Cutting",
      `${fmtCents(L.cuttingPerPiece)}/pc (4 cuts) × ${qty}`,
      fmtCents(L.cutting),
    ],
    L.qtyDiscount > 0
      ? ["Quantity break", `−${Math.round(L.qtyBreakRate * 100)}% of material + cutting`, fmtCents(-L.qtyDiscount)]
      : null,
    ["Setup", "1 alloy/thickness group", fmtCents(L.setup)],
    ["Line subtotal", "", fmtCents(L.lineSubtotal)],
    ["Margin", "18%", fmtCents(L.margin)],
    L.lineMinAdjustment > 0 ? ["Line minimum adjustment", "to $45.00", fmtCents(L.lineMinAdjustment)] : null,
    ["Line total", "", fmtCents(L.lineTotal)],
    O.orderMinAdjustment > 0 ? ["Order minimum adjustment", "to $120.00", fmtCents(O.orderMinAdjustment)] : null,
  ];
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {rows.filter(Boolean).map((r, i) => {
            const [name, detail, amount] = r!;
            const isTotal = name === "Line total";
            return (
              <tr key={i} className={`border-b border-neutral-800/60 last:border-0 ${isTotal ? "font-semibold text-neutral-100" : ""}`}>
                <td className="py-1.5 pr-3">{name}</td>
                <td className="num py-1.5 pr-3 text-xs text-neutral-500">{detail}</td>
                <td className="num py-1.5 text-right">{amount}</td>
              </tr>
            );
          })}
          <tr className="text-base font-bold text-orange-400">
            <td className="py-2 pr-3">Order total</td>
            <td />
            <td className="num py-2 text-right">{fmtCents(O.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        Price book <span className="num">{breakdown.priceBookId}</span> · density{" "}
        <span className="num">{breakdown.inputs.densityLbIn3} lb/in³</span> · lead time{" "}
        <span className="num">{breakdown.leadTime.days} business days</span>{" "}
        ({breakdown.leadTime.contributors.join("; ")}) · every figure recomputes by hand from
        these inputs.
      </p>
    </div>
  );
}

export function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="num mt-0.5 text-sm text-neutral-200">{value}</div>
    </div>
  );
}

export { fmtDate };
