"use client";
// Stretch §12: simple-vs-nested pricing toggle + SVG nest visualization.
// Renders entirely from the persisted NestingRecord — no arithmetic here.
import { useState } from "react";
import { fmtCents, fmtIn } from "@/lib/format";
import type { NestingRecord } from "@/nesting/price";
import type { PlateUsage } from "@/nesting/nest";

export function NestPanel({
  nesting,
  simpleTotalCents,
}: {
  nesting: NestingRecord;
  simpleTotalCents: number;
}) {
  const [showNested, setShowNested] = useState(false);
  const { nest, pricing } = nesting;
  const nestedTotal = pricing.breakdown.orderCents.total;
  const savings = pricing.deltaCents;

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Inventory nesting (stretch)
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
          <span className={showNested ? "" : "text-neutral-200"}>Simple</span>
          <button
            type="button"
            role="switch"
            aria-checked={showNested}
            onClick={() => setShowNested((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition-colors ${showNested ? "bg-orange-600" : "bg-neutral-700"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${showNested ? "left-4.5" : "left-0.5"}`}
            />
          </button>
          <span className={showNested ? "text-neutral-200" : ""}>Nested</span>
        </label>
      </div>

      {!showNested ? (
        <p className="mt-3 text-sm text-neutral-400">
          This blank nested onto in-stock plate
          {nest.usages.some((u) => u.plate.isRemnant) ? " (including a remnant)" : ""} at{" "}
          <span className="num text-neutral-200">{pct(pricing.yieldPct)}</span> yield — flip the
          toggle to compare yield-based pricing against the simple quote. The official quote total
          stays the simple price.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Side-by-side totals + delta (§12) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TotalCard label="Simple pricing (official)" value={fmtCents(simpleTotalCents)} />
            <TotalCard label="Nested pricing" value={fmtCents(nestedTotal)} accent />
            <div
              className={`rounded-lg border p-4 ${savings > 0 ? "border-green-800 bg-green-950/30" : savings < 0 ? "border-red-900 bg-red-950/20" : "border-neutral-800 bg-neutral-900/60"}`}
            >
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Delta</div>
              <div
                className={`num mt-1 text-xl font-bold ${savings > 0 ? "text-green-400" : savings < 0 ? "text-red-400" : "text-neutral-300"}`}
              >
                {savings > 0 ? `−${fmtCents(savings)}` : savings < 0 ? `+${fmtCents(-savings)}` : fmtCents(0)}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {savings > 0 ? "nesting is cheaper" : savings < 0 ? "nesting costs more" : "identical"}
              </div>
            </div>
          </div>

          {/* Per-plate material lines — hand-recomputable like everything else */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="py-2 pr-3">Plate</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Consumed (in²)</th>
                  <th className="py-2 pr-3">Weight</th>
                  <th className="py-2 pr-3">Rate</th>
                  <th className="py-2 text-right">Material</th>
                </tr>
              </thead>
              <tbody>
                {pricing.materialByPlate.map((p) => (
                  <tr key={p.plateId} className="border-b border-neutral-800/60 last:border-0">
                    <td className="num py-1.5 pr-3">
                      {p.plateId}
                      {p.isRemnant && (
                        <span className="ml-2 rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] uppercase text-amber-400">
                          remnant −{Math.round((1 - pricing.remnantRateFactor) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="num py-1.5 pr-3 text-neutral-400">
                      {fmtIn(p.plateWIn)} × {fmtIn(p.plateLIn)}
                    </td>
                    <td className="num py-1.5 pr-3">{round3(p.consumedAreaIn2)}</td>
                    <td className="num py-1.5 pr-3">{p.weightLb} lb</td>
                    <td className="num py-1.5 pr-3">{fmtCents(Math.round(p.ratePerLb * 100))}/lb</td>
                    <td className="num py-1.5 text-right">{fmtCents(p.materialCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-neutral-500">
              Effective yield <span className="num text-neutral-300">{pct(pricing.yieldPct)}</span>{" "}
              = blank area <span className="num">{round3(pricing.totalBlankAreaIn2)} in²</span> ÷
              net consumed <span className="num">{round3(pricing.totalConsumedAreaIn2)} in²</span>{" "}
              (severed strips minus returned off-cuts ≥ 6″×6″, credited at 100%). All later steps —
              cutting, qty break, setup, margin, minimums — are identical to the simple breakdown.
            </p>
          </div>

          {/* Nest layout per plate */}
          {nest.usages.map((u) => (
            <NestSvg key={u.plate.id} usage={u} />
          ))}
        </div>
      )}
    </section>
  );
}

function TotalCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`num mt-1 text-xl font-bold ${accent ? "text-orange-400" : "text-neutral-200"}`}>
        {value}
      </div>
    </div>
  );
}

/** Plate drawn landscape: x = along plate length, y = across plate width. */
function NestSvg({ usage }: { usage: PlateUsage }) {
  const W = 460;
  const pad = 6;
  const scale = (W - pad * 2) / usage.plate.lengthIn;
  const plateH = usage.plate.widthIn * scale;
  const H = plateH + pad * 2 + 18;
  const x = (yIn: number) => pad + yIn * scale;
  const y = (xIn: number) => pad + xIn * scale;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl">
        <defs>
          <pattern id={`hatch-${usage.plate.id}`} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-neutral-500" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={pad} y={pad} width={usage.plate.lengthIn * scale} height={plateH}
          className="fill-neutral-900 stroke-neutral-500" strokeWidth={1.2} />
        {usage.returnedOffcuts.map((o, i) => (
          <g key={`o${i}`}>
            <rect x={x(o.yIn)} y={y(o.xIn)} width={o.lengthIn * scale} height={o.widthIn * scale}
              fill={`url(#hatch-${usage.plate.id})`} className="stroke-neutral-600" strokeWidth={0.8} strokeDasharray="3 2" />
            {o.lengthIn * scale > 60 && o.widthIn * scale > 16 && (
              <text x={x(o.yIn) + (o.lengthIn * scale) / 2} y={y(o.xIn) + (o.widthIn * scale) / 2 + 3}
                textAnchor="middle" fontSize={9} className="num fill-neutral-400">
                remnant {round3(o.widthIn)} × {round3(o.lengthIn)}
              </text>
            )}
          </g>
        ))}
        {usage.placements.map((p, i) => (
          <g key={`p${i}`}>
            <rect x={x(p.yIn)} y={y(p.xIn)} width={p.lIn * scale} height={p.wIn * scale}
              className="fill-orange-500/25 stroke-orange-500" strokeWidth={1} />
            <text x={x(p.yIn) + (p.lIn * scale) / 2} y={y(p.xIn) + (p.wIn * scale) / 2 + 3}
              textAnchor="middle" fontSize={9} className="num fill-orange-300">
              {i + 1}{p.rotated ? " ⟳" : ""}
            </text>
          </g>
        ))}
        <text x={pad} y={H - 4} fontSize={9} className="num fill-neutral-500">
          {usage.plate.id} — {round3(usage.plate.widthIn)} × {round3(usage.plate.lengthIn)} in
          {usage.plate.isRemnant ? " (remnant)" : ""} · hatched = returned to inventory
        </text>
      </svg>
    </div>
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function round3(v: number): number {
  return Number(v.toFixed(3));
}
