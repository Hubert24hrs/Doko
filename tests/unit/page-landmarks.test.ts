import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every page renders a <main id="main">.
 *
 * The root layout's skip link targets #main. Four pages were built without
 * one -- /projects, /ai, /verification and the payment return page -- so on
 * those the skip link pointed at nothing, and none of them had a site header
 * either: a visitor arriving from the landing page or the sitemap had no way
 * to navigate anywhere. The rendered-page tests found them, but those can only
 * reach pages a signed-out browser can open. This reads the source instead, so
 * it covers the signed-in pages too, and it runs in milliseconds.
 */

const APP = join(process.cwd(), "src", "app");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("page landmarks", () => {
  const all = pages(APP);

  it("finds the pages to check", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it("gives every page a <main id=\"main\"> for the skip link to land on", () => {
    const missing = all
      .filter((file) => !/<main\b[^>]*\bid="main"/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));
    expect(missing).toEqual([]);
  });
});
