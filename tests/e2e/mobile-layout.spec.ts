import { expect, test, type Page } from "@playwright/test";

/**
 * What a person holding a phone would notice, asserted on every public page.
 *
 * Each check here corresponds to something that actually shipped broken:
 *
 *   - touch targets under 44px  -> every filter chip on /events and /issues
 *     was 22-28px tall; reported as "it doesn't select when clicked"
 *   - the logo being covered    -> an undefined `sr-only-focusable` class left
 *     the skip link visible on top of the wordmark on every page
 *   - sideways scrolling        -> the cheapest way a phone layout breaks, and
 *     the one nobody notices on a desktop
 *
 * Runs signed out: no credentials, no writes, and the dev server it starts
 * talks to the live database, so that matters.
 */

const PAGES = [
  "/",
  "/communities",
  "/communities/enugu-ezike",
  "/communities/ogrute",
  "/events",
  "/issues",
  "/jobs",
  "/marketplace",
  "/projects",
  "/directory",
  "/login",
  "/register",
];

/** Apple asks 44pt, Material 48dp. This project's `.tap-target` gives 44px. */
const MIN_TARGET = 44;

type Offender = { tag: string; text: string; height: number; width: number };

async function undersizedControls(page: Page): Promise<Offender[]> {
  return page.evaluate((min) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 1 &&
        r.height > 1 &&
        cs.visibility !== "hidden" &&
        cs.display !== "none" &&
        el.closest("[aria-hidden='true']") === null
      );
    };

    // WCAG 2.5.8's "inline" exception: a target "in a sentence, or whose size
    // is otherwise constrained by the line-height of non-target text". A link
    // RENDERED inline is exactly that -- its height is the line box it sits in
    // -- and forcing it to 44px would break that line.
    //
    // An earlier version also demanded a <p> ancestor, which wrongly flagged
    // the byline link on an issue card ("Reported by Idoko Hubert Iheanacho",
    // 16px, inside a <span>). A byline is as much a sentence as a paragraph is.
    // Anything laid out as a block or a flex item still has to meet the target.
    const inlineInProse = (el: Element) =>
      el.tagName === "A" && getComputedStyle(el).display === "inline";

    const candidates = document.querySelectorAll(
      "a[href], button, [role='button'], select, summary",
    );

    const out: { tag: string; text: string; height: number; width: number }[] = [];
    for (const el of candidates) {
      if (!visible(el)) continue;
      if ((el as HTMLAnchorElement).getAttribute("href") === "#main") continue;
      if (inlineInProse(el)) continue;
      const r = el.getBoundingClientRect();
      if (Math.round(r.height) < min) {
        out.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
          height: Math.round(r.height),
          width: Math.round(r.width),
        });
      }
    }
    return out;
  }, MIN_TARGET);
}

for (const path of PAGES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status(), `${path} should load`).toBeLessThan(400);
      await page.locator("main").first().waitFor();
    });

    test("does not scroll sideways", async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, "page is wider than the phone").toBeLessThanOrEqual(1);
    });

    test("keeps the skip link hidden until it is focused", async ({ page }) => {
      const box = await page.locator("a[href='#main']").first().boundingBox();
      // Absent is fine; present must be the 1px visually-hidden state.
      if (box) {
        expect(box.width, "skip link is visible").toBeLessThanOrEqual(1);
        expect(box.height, "skip link is visible").toBeLessThanOrEqual(1);
      }
    });

    test("leaves the logo uncovered", async ({ page }) => {
      const logo = page.locator("header a[href='/'], header a[href='/home']").first();
      if ((await logo.count()) === 0) return; // pages without the site header
      const covered = await logo.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit !== null && !el.contains(hit);
      });
      expect(covered, "something is drawn on top of the logo").toBe(false);
    });

    test(`gives every control a ${MIN_TARGET}px touch target`, async ({ page }) => {
      const offenders = await undersizedControls(page);
      expect(
        offenders,
        `controls under ${MIN_TARGET}px:\n` +
          offenders.map((o) => `  <${o.tag}> "${o.text}" ${o.width}x${o.height}`).join("\n"),
      ).toEqual([]);
    });
  });
}
