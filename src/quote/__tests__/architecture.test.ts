import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Acceptance §10.9: no unvalidated LLM output can ever reach pricing — the
// deterministic zone must not even import the Anthropic SDK.
function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.includes("__tests__"))
    .map((f) => path.join(dir, f));
}

describe("deterministic zone purity (§10.9)", () => {
  const zones = [
    path.join(process.cwd(), "src", "pricing"),
    path.join(process.cwd(), "src", "rules"),
    path.join(process.cwd(), "src", "nesting"),
  ];

  it("src/pricing and src/rules import nothing from the Anthropic SDK", () => {
    for (const zone of zones) {
      for (const file of sourceFiles(zone)) {
        const src = fs.readFileSync(file, "utf8");
        expect(src, `${file} must not reference the Anthropic SDK`).not.toMatch(
          /@anthropic-ai|from\s+["'].*anthropic/i,
        );
      }
    }
  });

  it("the deterministic zone does not import from src/extraction adapters (schema types only)", () => {
    for (const zone of zones) {
      for (const file of sourceFiles(zone)) {
        const src = fs.readFileSync(file, "utf8");
        expect(src, `${file} must not import extraction adapters`).not.toMatch(
          /from\s+["'].*extraction\/(pdf|text|step|llm|client|prompt)["']/,
        );
      }
    }
  });
});
