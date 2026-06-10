import { defineConfig, devices } from "@playwright/test";

// Browser-level e2e (§10 flows through the real UI). The webServer reseeds
// first so plate inventory and quotes start from a known state — nest-pricing
// assertions depend on the seeded remnants being available.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // quotes mutate shared plate inventory; specs run serially
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3344",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production server: `next dev` allows only one instance per project
    // (singleton lock), so e2e must not race a dev server you have open.
    command: "npm run seed > /dev/null && npx next build > /dev/null && npx next start -p 3344",
    port: 3344,
    reuseExistingServer: false, // always reseed: tests assert exact nest deltas
    timeout: 180_000,
  },
});
