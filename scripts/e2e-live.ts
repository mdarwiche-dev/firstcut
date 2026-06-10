// Live end-to-end check (§11): real Claude extraction against the generated
// fixtures, asserted against the §7.3/§9 expected outcomes. Manual script —
// not part of CI. Requires ANTHROPIC_API_KEY; run `npm run seed` first.
import fs from "node:fs";
import path from "node:path";

// tsx doesn't auto-load .env.local the way `next dev` does.
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { getAnthropicClient } from "../src/extraction/client";
import { extractFromPdf } from "../src/extraction/pdf";
import { extractFromText } from "../src/extraction/text";
import { extractFromStep } from "../src/extraction/step";
import { assembleQuote } from "../src/quote/assemble";
import { loadPriceBookRows } from "../src/quote/persist";

const FIXTURES = path.join(process.cwd(), "fixtures");
const today = new Date().toISOString().slice(0, 10);

let failures = 0;
function check(name: string, cond: boolean, detail: string) {
  const mark = cond ? "✅" : "❌";
  if (!cond) failures++;
  console.log(`${mark} ${name} — ${detail}`);
}

async function main() {
  const client = getAnthropicClient();
  const priceBook = loadPriceBookRows();
  const fmt = (cents: number | null) =>
    cents == null ? "(no price)" : `$${(cents / 100).toFixed(2)}`;

  // ---- Fixture A: the demo centerpiece. Must price to exactly $292.09.
  console.log("\n— Fixture A (PDF, 7075 bracket) —");
  const exA = await extractFromPdf(
    fs.readFileSync(path.join(FIXTURES, "A-bracket-7075.pdf")),
    client,
  );
  if (!exA.ok) {
    check("A extraction", false, `failed at stage ${exA.error.stage}: ${exA.error.message}`);
  } else {
    console.log("   extracted:", JSON.stringify(exA.extraction.envelope), exA.extraction.material.rawText);
    const qA = assembleQuote({ extractionResult: exA, priceBook, quoteDate: today });
    check("A status", qA.status === "priced", `status=${qA.status} issues=${JSON.stringify(qA.issues)}`);
    check("A total", qA.totalCents === 29209, `total=${fmt(qA.totalCents)} (expected $292.09)`);
    check(
      "A blank",
      qA.blank?.thicknessIn === 1.25 &&
        Math.abs((qA.blank?.widthIn ?? 0) - 3.45) < 1e-9 &&
        Math.abs((qA.blank?.lengthIn ?? 0) - 7.75) < 1e-9,
      `blank=${JSON.stringify(qA.blank)}`,
    );
  }

  // ---- Fixture B: metric, no temper, no qty → two assumptions.
  console.log("\n— Fixture B (PDF, metric 6061) —");
  const exB = await extractFromPdf(
    fs.readFileSync(path.join(FIXTURES, "B-plate-metric.pdf")),
    client,
  );
  if (!exB.ok) {
    check("B extraction", false, `failed: ${exB.error.message}`);
  } else {
    const qB = assembleQuote({ extractionResult: exB, priceBook, quoteDate: today });
    const codes = qB.assumptions.map((a) => a.code).sort();
    check("B status", qB.status === "priced", `status=${qB.status}`);
    check(
      "B assumptions",
      codes.join(",") === "QTY_DEFAULTED,TEMPER_DEFAULTED",
      `assumptions=${codes.join(",")}`,
    );
    check(
      "B conversion",
      Math.abs((qB.partEnvelope?.lengthIn ?? 0) - 7.48) < 0.005,
      `envelope=${JSON.stringify(qB.partEnvelope)}`,
    );
  }

  // ---- Fixture C: 316 stainless → needs_review, no price.
  console.log("\n— Fixture C (PDF, 316 stainless) —");
  const exC = await extractFromPdf(
    fs.readFileSync(path.join(FIXTURES, "C-manifold-316ss.pdf")),
    client,
  );
  if (!exC.ok) {
    check("C extraction", false, `failed: ${exC.error.message}`);
  } else {
    const qC = assembleQuote({ extractionResult: exC, priceBook, quoteDate: today });
    check("C status", qC.status === "needs_review", `status=${qC.status}`);
    check("C no price", qC.totalCents === null, `total=${fmt(qC.totalCents)}`);
    check(
      "C by-request issue",
      qC.issues.some((i) => i.code === "BY_REQUEST_MATERIAL"),
      JSON.stringify(qC.issues.map((i) => i.code)),
    );
  }

  // ---- Fixture D: oversize → rejected, all orientations invalid.
  console.log("\n— Fixture D (PDF, oversize rail) —");
  const exD = await extractFromPdf(
    fs.readFileSync(path.join(FIXTURES, "D-rail-oversize.pdf")),
    client,
  );
  if (!exD.ok) {
    check("D extraction", false, `failed: ${exD.error.message}`);
  } else {
    const qD = assembleQuote({ extractionResult: exD, priceBook, quoteDate: today });
    check("D status", qD.status === "rejected", `status=${qD.status}`);
    check("D no price", qD.totalCents === null, `total=${fmt(qD.totalCents)}`);
    check(
      "D all orientations invalid",
      (qD.orientations ?? []).length === 3 && qD.orientations!.every((o) => !o.valid),
      JSON.stringify(qD.orientations?.map((o) => o.reason)),
    );
  }

  // ---- T1 text fixture → identical to §7.3.
  console.log("\n— Fixture T1 (text) —");
  const exT1 = await extractFromText("7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4", client);
  if (!exT1.ok) {
    check("T1 extraction", false, `failed: ${exT1.error.message}`);
  } else {
    const qT1 = assembleQuote({ extractionResult: exT1, priceBook, quoteDate: today });
    check("T1 total", qT1.totalCents === 29209, `total=${fmt(qT1.totalCents)}`);
  }

  // ---- T2: qty 12 → 7% break and +1 lead day.
  console.log("\n— Fixture T2 (text, marine) —");
  const exT2 = await extractFromText(
    "need 12 pcs 5083 plate blanks for a marine bracket, 18 x 6 x 0.6 finished",
    client,
  );
  if (!exT2.ok) {
    check("T2 extraction", false, `failed: ${exT2.error.message}`);
  } else {
    const qT2 = assembleQuote({ extractionResult: exT2, priceBook, quoteDate: today });
    check("T2 status", qT2.status === "priced", `status=${qT2.status} issues=${JSON.stringify(qT2.issues)}`);
    check("T2 alloy", qT2.alloyCode === "5083" && qT2.qty === 12, `${qT2.alloyCode} qty=${qT2.qty}`);
    check(
      "T2 break + lead",
      qT2.breakdown?.linesCents.qtyBreakRate === 0.07 && qT2.breakdown?.leadTime.days === 3,
      `break=${qT2.breakdown?.linesCents.qtyBreakRate} lead=${qT2.breakdown?.leadTime.days}`,
    );
    check(
      "T2 temper assumption",
      qT2.assumptions.some((a) => a.code === "TEMPER_DEFAULTED"),
      JSON.stringify(qT2.assumptions.map((a) => a.code)),
    );
  }

  // ---- T3: nonsense must degrade gracefully — flags or error, never a price.
  console.log("\n— Fixture T3 (nonsense) —");
  const exT3 = await extractFromText("asdf give me a quote for vibes", client);
  if (!exT3.ok) {
    check("T3 graceful", true, `extraction_failed at stage ${exT3.error.stage} (acceptable)`);
  } else {
    const qT3 = assembleQuote({ extractionResult: exT3, priceBook, quoteDate: today });
    check(
      "T3 graceful",
      qT3.status === "needs_review" || qT3.status === "rejected" || qT3.status === "extraction_failed",
      `status=${qT3.status} issues=${JSON.stringify(qT3.issues.map((i) => i.code))}`,
    );
  }

  // ---- STEP fixture (no LLM).
  console.log("\n— Fixture S (STEP) —");
  const exS = await extractFromStep(fs.readFileSync(path.join(FIXTURES, "S-block.step")), {
    alloyCode: "6061",
    temper: "T651",
    qty: 5,
    units: "mm",
  });
  if (!exS.ok) {
    check("S extraction", false, `failed: ${exS.error.message}`);
  } else {
    const qS = assembleQuote({ extractionResult: exS, priceBook, quoteDate: today });
    check(
      "S priced with 4% break",
      qS.status === "priced" && qS.breakdown?.linesCents.qtyBreakRate === 0.04,
      `status=${qS.status} break=${qS.breakdown?.linesCents.qtyBreakRate}`,
    );
  }

  console.log(failures === 0 ? "\nALL LIVE E2E CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
