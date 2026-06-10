import { expect, test } from "@playwright/test";
import fs from "node:fs";

// Serial: quoting consumes seeded plate inventory, so order matters. The
// Playwright webServer reseeds before the run, making every number below
// deterministic. All tests except the last avoid the LLM entirely.
test.describe.configure({ mode: "serial" });

test("intake page renders tabs, fixture chips, and the disclaimer footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Drawing (PDF)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "STEP", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paste spec" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try: clean 7075 drawing" })).toBeVisible();
  // §13.3 disclaimer must be in the footer of every page
  await expect(page.locator("footer")).toContainText("independent, unaffiliated demonstration project");
});

test("server-side validation errors surface in the form (wrong file type)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "STEP", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-a-model.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await page.getByRole("button", { name: "Quote this STEP file" }).click();
  await expect(page.getByText(".step/.stp only")).toBeVisible();
});

test("STEP fixture quotes to $284.34, nests onto the seeded remnant, persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "STEP", exact: true }).click();
  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Try: 6×4×1 block (STEP)" }).click();

  // Redirect to the shareable quote page; deterministic no-LLM path.
  await page.waitForURL(/\/quotes\/.+/);
  await expect(page.getByText("priced", { exact: true })).toBeVisible();
  await expect(page.getByText("$284.34").first()).toBeVisible();
  await expect(page.getByText("Order total")).toBeVisible();
  // chosen blank from the 3-axis search
  await expect(page.getByText("CHOSEN — lowest blank volume")).toBeVisible();

  // §12 toggle: side-by-side totals with the delta, against the seeded
  // 14×30 6061 remnant (90.3% yield, remnant rate factor 0.7).
  await expect(page.getByText("Inventory nesting (stretch)")).toBeVisible();
  await page.getByRole("switch").click();
  await expect(page.getByText("Simple pricing (official)")).toBeVisible();
  await expect(page.getByText("Nested pricing", { exact: true })).toBeVisible();
  await expect(page.getByText("$269.80")).toBeVisible();
  await expect(page.getByText("−$14.54")).toBeVisible();
  await expect(page.getByText("nesting is cheaper")).toBeVisible();
  await expect(page.getByText("pl_6061_125_rem").first()).toBeVisible(); // table line + SVG caption
  // SVG layout with returned off-cuts hatched
  await expect(page.getByText("hatched = returned to inventory")).toBeVisible();

  // §10.11: reload renders identically from persisted rows.
  const url = page.url();
  await page.reload();
  await expect(page.getByText("$284.34").first()).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("quotes list shows the persisted quote", async ({ page }) => {
  await page.goto("/quotes");
  await expect(page.getByRole("link", { name: /#/ }).first()).toBeVisible();
  await expect(page.getByText("$284.34")).toBeVisible();
  await expect(page.getByText("priced", { exact: true })).toBeVisible();
});

// Live-LLM half: the full §7.3 demo path through real Claude vision. Skipped
// when no key is configured (CI); locally .env.local enables it.
const hasKey =
  !!process.env.ANTHROPIC_API_KEY ||
  (fs.existsSync(".env.local") && fs.readFileSync(".env.local", "utf8").includes("ANTHROPIC_API_KEY"));

test("fixture A drawing prices to $292.09 via live extraction and beats simple when nested", async ({ page }) => {
  test.skip(!hasKey, "ANTHROPIC_API_KEY not configured");
  test.setTimeout(120_000);

  await page.goto("/");
  await page.getByRole("button", { name: "Try: clean 7075 drawing" }).click();
  await page.waitForURL(/\/quotes\/.+/, { timeout: 90_000 });

  await expect(page.getByText("priced", { exact: true })).toBeVisible();
  await expect(page.getByText("$292.09").first()).toBeVisible(); // §7.3 to the cent

  // Nests onto the seeded 12×24 7075 remnant: $269.50, saving $22.59.
  await page.getByRole("switch").click();
  await expect(page.getByText("$269.50")).toBeVisible();
  await expect(page.getByText("−$22.59")).toBeVisible();
});
