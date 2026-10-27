import { defineConfig, devices } from "@playwright/test";

/**
 * Rendered-page checks: the kind of test this project did not have.
 *
 * 581 pgTAP assertions and 300-odd unit tests, and none of them had ever opened
 * a page and looked at it -- which is how an undefined CSS class put a green
 * "Skip to main content" pill over the logo on every page since day one, and
 * how every filter chip shipped too small to tap. Both were found on a phone by
 * a person, not by a test.
 *
 * Runs in the Chrome already installed on the machine (channel: "chrome"), so
 * no ~150 MB browser download. Signed out, so it needs no credentials and
 * writes nothing -- important, because the dev server talks to the LIVE
 * database.
 *
 *   npm run test:e2e                      # against a dev server it starts
 *   PLAYWRIGHT_BASE_URL=https://ezikeoba.com npm run test:e2e
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  // `.spec.ts`, deliberately: vitest collects `*.test.ts`, and must not try to
  // run these.
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL },
  projects: [
    {
      // 360x780 is the size of the phone the chip bug was reported from, with
      // touch emulation on so `(pointer: coarse)` applies as it does there.
      name: "phone",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 780 },
        channel: "chrome",
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
