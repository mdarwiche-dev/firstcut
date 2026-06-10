// Quote list (§8.3): newest first; empty state points at the fixtures.
import Link from "next/link";
import { listQuotes } from "@/quote/persist";
import { StatusBadge } from "@/components/quote-panels";
import { fmtCents, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function QuotesPage() {
  const rows = listQuotes();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-400">
          No quotes yet.{" "}
          <Link href="/" className="text-orange-400 hover:text-orange-300">
            Start with a fixture chip on the intake page
          </Link>{" "}
          — the clean 7075 drawing prices in one click.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">Quote</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5">Input</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Material</th>
                <th className="px-4 py-2.5">Blank</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t border-neutral-800/70 hover:bg-neutral-900/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/quotes/${q.id}`} className="num text-orange-400 hover:text-orange-300">
                      #{q.id}
                    </Link>
                  </td>
                  <td className="num px-4 py-2.5 text-neutral-400">{fmtDate(q.createdAt)}</td>
                  <td className="px-4 py-2.5 uppercase text-xs text-neutral-400">{q.inputType}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={q.status} /></td>
                  <td className="num px-4 py-2.5">{q.alloyCode ? `${q.alloyCode}${q.temper ? `-${q.temper}` : ""}` : "—"}</td>
                  <td className="num px-4 py-2.5 text-neutral-400">
                    {q.blank ? `${r3(q.blank.thicknessIn)} × ${r3(q.blank.widthIn)} × ${r3(q.blank.lengthIn)}` : "—"}
                  </td>
                  <td className="num px-4 py-2.5 text-right">
                    {q.totalCents != null ? fmtCents(q.totalCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function r3(v: number): number {
  return Number(v.toFixed(3));
}
