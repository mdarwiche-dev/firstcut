"use client";

// Intake form (§8.1): three tabs sharing one settings panel and one submit
// path; fixture chips run the pipeline in one click.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface AlloyOption {
  code: string;
  name: string;
  tempers: string[];
  defaultTemper: string | null;
}
interface TextFixture {
  id: string;
  label: string;
  text: string;
}

type Tab = "pdf" | "step" | "text";

const STAGES = ["Rendering", "Extracting", "Validating", "Pricing"];

const PDF_CHIPS = [
  { fixture: "A", label: "Try: clean 7075 drawing" },
  { fixture: "B", label: "metric / missing temper" },
  { fixture: "C", label: "316 stainless (manual review)" },
  { fixture: "D", label: "oversize (rejection)" },
];

export function IntakeForm({
  alloys,
  textFixtures,
}: {
  alloys: AlloyOption[];
  textFixtures: TextFixture[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pdf");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // settings (§6.1 defaults)
  const [sideAllowance, setSideAllowance] = useState(0.125);
  const [cleanup, setCleanup] = useState(0.1);
  const [dfars, setDfars] = useState(false);
  const [qtyOverride, setQtyOverride] = useState("");

  // STEP form (§5.3)
  const [alloyCode, setAlloyCode] = useState("6061");
  const [temper, setTemper] = useState<string>("T651");
  const [stepQty, setStepQty] = useState("1");
  const [stepUnits, setStepUnits] = useState<"mm" | "in">("mm");

  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startStages(startAt: number) {
    setStage(startAt);
    let i = startAt;
    stageTimer.current = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 1);
      setStage(i);
    }, 1600);
  }
  function stopStages() {
    if (stageTimer.current) clearInterval(stageTimer.current);
    setStage(null);
  }

  async function submit(extra: Record<string, string>, f?: File | null) {
    setError(null);
    const fd = new FormData();
    fd.set("sideAllowanceIn", String(sideAllowance));
    fd.set("minThicknessCleanupIn", String(cleanup));
    fd.set("dfars", String(dfars));
    if (qtyOverride.trim()) fd.set("qtyOverride", qtyOverride.trim());
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    if (f) fd.set("file", f);

    startStages(extra.inputType === "pdf" ? 0 : 1);
    try {
      const res = await fetch("/api/quote", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push(`/quotes/${body.id}`);
    } catch (e) {
      stopStages();
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const selectedAlloy = alloys.find((a) => a.code === alloyCode);
  const busy = stage !== null;

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm rounded-t border-b-2 transition-colors ${
      tab === t
        ? "border-orange-500 text-neutral-100 bg-neutral-900"
        : "border-transparent text-neutral-400 hover:text-neutral-200"
    }`;

  const chipClass =
    "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-400 transition-colors disabled:opacity-40";

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="flex border-b border-neutral-800 px-4 pt-2">
        <button className={tabClass("pdf")} onClick={() => setTab("pdf")}>Drawing (PDF)</button>
        <button className={tabClass("step")} onClick={() => setTab("step")}>STEP</button>
        <button className={tabClass("text")} onClick={() => setTab("text")}>Paste spec</button>
      </div>

      <div className="p-5 space-y-4">
        {tab === "pdf" && (
          <div className="space-y-3">
            <input
              type="file"
              accept=".pdf"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-400 file:mr-4 file:rounded file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-neutral-200 hover:file:bg-neutral-700"
            />
            <div className="flex flex-wrap gap-2">
              {PDF_CHIPS.map((c) => (
                <button
                  key={c.fixture}
                  className={chipClass}
                  disabled={busy}
                  onClick={() => submit({ inputType: "pdf", fixture: c.fixture })}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              disabled={busy || !file}
              onClick={() => submit({ inputType: "pdf" }, file)}
              className="rounded bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            >
              Quote this drawing
            </button>
          </div>
        )}

        {tab === "step" && (
          <div className="space-y-3">
            <input
              type="file"
              accept=".step,.stp"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-400 file:mr-4 file:rounded file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-neutral-200 hover:file:bg-neutral-700"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-xs text-neutral-400">
                Alloy
                <select
                  value={alloyCode}
                  disabled={busy}
                  onChange={(e) => {
                    setAlloyCode(e.target.value);
                    const a = alloys.find((x) => x.code === e.target.value);
                    setTemper(a?.defaultTemper ?? "");
                  }}
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                >
                  {alloys.map((a) => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-400">
                Temper
                <select
                  value={temper}
                  disabled={busy || (selectedAlloy?.tempers.length ?? 0) === 0}
                  onChange={(e) => setTemper(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                >
                  {(selectedAlloy?.tempers.length ? selectedAlloy.tempers : [""]).map((t) => (
                    <option key={t} value={t}>{t || "(none)"}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-400">
                Quantity
                <input
                  type="number" min={1} value={stepQty} disabled={busy}
                  onChange={(e) => setStepQty(e.target.value)}
                  className="num mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                />
              </label>
              <label className="text-xs text-neutral-400">
                Detected units — change if wrong
                <select
                  value={stepUnits} disabled={busy}
                  onChange={(e) => setStepUnits(e.target.value as "mm" | "in")}
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
                >
                  <option value="mm">mm (detected)</option>
                  <option value="in">inches</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={chipClass}
                disabled={busy}
                onClick={() =>
                  submit({
                    inputType: "step", fixture: "S",
                    alloyCode, temper, qty: stepQty || "5", units: stepUnits,
                  })
                }
              >
                Try: 6×4×1 block (STEP)
              </button>
            </div>
            <button
              disabled={busy || !file}
              onClick={() =>
                submit({ inputType: "step", alloyCode, temper, qty: stepQty, units: stepUnits }, file)
              }
              className="rounded bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            >
              Quote this STEP file
            </button>
          </div>
        )}

        {tab === "text" && (
          <div className="space-y-3">
            <textarea
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="e.g. 7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600"
            />
            <div className="flex flex-wrap gap-2">
              {textFixtures.map((f) => (
                <button
                  key={f.id}
                  className={chipClass}
                  disabled={busy}
                  title={f.text}
                  onClick={() => {
                    setText(f.text);
                    submit({ inputType: "text", text: f.text });
                  }}
                >
                  {f.id}: {f.label}
                </button>
              ))}
            </div>
            <button
              disabled={busy || !text.trim()}
              onClick={() => submit({ inputType: "text", text })}
              className="rounded bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            >
              Quote this spec
            </button>
          </div>
        )}

        {/* settings panel (§8.1) */}
        <div className="border-t border-neutral-800 pt-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
          >
            {showSettings ? "▾" : "▸"} Machining settings
          </button>
          {showSettings && (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <label className="text-xs text-neutral-400">
                Side allowance (in/side)
                <input
                  type="number" min={0} max={0.5} step={0.0625} value={sideAllowance} disabled={busy}
                  onChange={(e) => setSideAllowance(Number(e.target.value))}
                  className="num mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-neutral-400">
                Thickness cleanup (in)
                <input
                  type="number" min={0} max={0.5} step={0.05} value={cleanup} disabled={busy}
                  onChange={(e) => setCleanup(Number(e.target.value))}
                  className="num mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-neutral-400">
                Quantity override
                <input
                  type="number" min={1} placeholder="(use extracted)" value={qtyOverride} disabled={busy}
                  onChange={(e) => setQtyOverride(e.target.value)}
                  className="num mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm placeholder:text-neutral-600"
                />
              </label>
              <label className="flex items-end gap-2 pb-1.5 text-xs text-neutral-400">
                <input
                  type="checkbox" checked={dfars} disabled={busy}
                  onChange={(e) => setDfars(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
                DFARS / domestic-only
              </label>
            </div>
          )}
        </div>

        {busy && (
          <div className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <span className="text-neutral-300">
              {STAGES.map((s, i) => (
                <span key={s} className={i === stage ? "text-orange-400" : i < (stage ?? 0) ? "text-neutral-500" : "text-neutral-600"}>
                  {s}{i < STAGES.length - 1 ? " → " : ""}
                </span>
              ))}
            </span>
          </div>
        )}
        {error && (
          <div className="rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
