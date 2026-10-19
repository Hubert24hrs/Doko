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
  "/ai",
  "/verification",
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

/**
 * The issues map labels places. Until 2026-10-19 it labelled ten from a
 * constant hard-coded in a component -- "Ogrute (LGA HQ)" when the
 * headquarters town is Enugu-Ezike, two places not in the directory at all,
 * and a district called a village -- while ignoring the coordinates admins can
 * now set on every community. Labels are read from `geo_entities` now; this
 * holds them to the directory, so an invented place cannot quietly return.
 */
test("the issues map labels only places the directory contains", async ({ page, request }) => {
  const directory = await (await request.get("/communities")).text();

  await page.goto("/issues?view=map", { waitUntil: "load" });
  await page.locator(".leaflet-container").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);

  const labels = await page
    .locator(".custom-landmark-marker")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/^\s*\S+\s+/, "").trim()));

  const invented = labels.filter((name) => !directory.includes(`>${name}<`));
  expect(invented, `map labels with no community in the directory: ${invented.join(", ")}`).toEqual([]);
});

/**
 * Found by a Playwright MCP sweep of production on 2026-10-19: three tab titles
 * read "... | Ezike Oba · Ezike Oba", because the page put the site name in its
 * own title and the root layout's template appends it again. Every other page
 * relies on the template, which is the right way round.
 */
for (const path of PAGES) {
  test(`${path} names the site in its title exactly once`, async ({ page }) => {
    await page.goto(path, { waitUntil: "load" });
    const title = await page.title();
    expect((title.match(/Ezike Oba/g) ?? []).length, `title: "${title}"`).toBeLessThanOrEqual(1);
  });

  // A placeholder is not a label: it disappears as soon as somebody types, and
  // screen readers do not reliably announce it. The Oba AI chat box had only a
  // placeholder, so it was read out as an anonymous "edit text".
  test(`${path} gives every form field an accessible name`, async ({ page }) => {
    await page.goto(path, { waitUntil: "load" });
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll(
        "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea",
      )]
        .filter((el) => {
          if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
          if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
          return !el.closest("label");
        })
        .map((el) => `<${el.tagName.toLowerCase()} name="${(el as HTMLInputElement).name}">`),
    );
    expect(unnamed, `fields with no label: ${unnamed.join(", ")}`).toEqual([]);
  });
}

/**
 * Every internal link on every public page resolves. 136 of them at the time
 * of writing, none broken -- this is here so that stays true when a route is
 * renamed or removed, which is when links break and nobody notices.
 */
test("no public page links to a page that does not exist", async ({ page, request }) => {
  // Fourteen page loads and ~136 requests do not fit the 90s default. Its
  // first run against production timed out -- which reads as a failure, and a
  // check that fails for no reason teaches people to ignore it.
  test.setTimeout(300_000);
  const hrefs = new Map<string, string>();
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "load" });
    for (const href of await page
      .locator('a[href^="/"]')
      .evaluateAll((els) => els.map((a) => (a.getAttribute("href") ?? "").split("#")[0]))) {
      if (href && !hrefs.has(href)) hrefs.set(href, path);
    }
  }

  // Ten at a time rather than one by one: still gentle on the server, and an
  // order of magnitude faster than sequential round trips.
  const broken: string[] = [];
  const entries = [...hrefs];
  for (let i = 0; i < entries.length; i += 10) {
    await Promise.all(
      entries.slice(i, i + 10).map(async ([href, foundOn]) => {
        const res = await request.get(href, { maxRedirects: 0 });
        if (res.status() >= 400) broken.push(`${res.status()} ${href} (linked from ${foundOn})`);
      }),
    );
  }
  expect(broken, `broken links:\n  ${broken.join("\n  ")}`).toEqual([]);
});
