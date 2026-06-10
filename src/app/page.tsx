import fs from "node:fs";
import path from "node:path";
import { ALLOYS } from "@/rules/catalog";
import { IntakeForm } from "@/components/IntakeForm";

export const dynamic = "force-dynamic";

interface TextFixture {
  id: string;
  label: string;
  text: string;
}

export default function Home() {
  const standardAlloys = ALLOYS.filter((a) => a.status === "standard").map((a) => ({
    code: a.code,
    name: a.name,
    tempers: a.tempers,
    defaultTemper: a.defaultTemper,
  }));

  let textFixtures: TextFixture[] = [];
  try {
    textFixtures = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "fixtures", "text-fixtures.json"), "utf8"),
    );
  } catch {
    // fixtures not generated yet — chips simply won't show
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quote a part</h1>
        <p className="mt-1 text-sm text-neutral-400 max-w-2xl">
          Upload a part drawing, a STEP file, or paste a spec. Claude extracts the part
          envelope and material — deterministic code converts it to a stock blank,
          validates it against the catalog, and prices it with a hand-recomputable
          breakdown.
        </p>
      </div>
      <IntakeForm alloys={standardAlloys} textFixtures={textFixtures} />
    </div>
  );
}
