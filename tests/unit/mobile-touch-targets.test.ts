import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Mobile Accessibility & Touch Target Guards", () => {
  describe("globals.css CSS contracts", () => {
    const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf-8");

    it("defines .sr-only-focusable with off-screen / 1px clipping when unfocused", () => {
      expect(css).toContain(".sr-only-focusable:not(:focus):not(:focus-within)");
      expect(css).toMatch(/position:\s*absolute\s*!important/);
      expect(css).toMatch(/width:\s*1px/);
      expect(css).toMatch(/height:\s*1px/);
      expect(css).toMatch(/clip-path:\s*inset\(50%\)/);
    });

    it("defines .tap-target with at least 44px (2.75rem) touch target for touch screens", () => {
      expect(css).toContain(".tap-target");
      expect(css).toMatch(/min-height:\s*2\.75rem/);
      expect(css).toMatch(/display:\s*inline-flex/);
    });

    it("relaxes .tap-target to 32px (2rem) for fine pointer devices (mouse)", () => {
      expect(css).toMatch(/@media\s*\(pointer:\s*fine\)\s*\{[\s\S]*?min-height:\s*2rem/);
    });

    it("defines .tap-row with adequate spacing (at least 8px / 0.5rem gap)", () => {
      expect(css).toContain(".tap-row");
      expect(css).toMatch(/gap:\s*0\.5rem/);
    });
  });

  describe("Root layout skip-link guard", () => {
    const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf-8");

    it("contains skip to main content link with .sr-only-focusable so it never obscures the logo", () => {
      expect(layout).toMatch(/<a[\s\S]*?href="#main"[\s\S]*?>[\s\S]*?Skip to main content/);
      expect(layout).toMatch(/className="[^"]*sr-only-focusable[^"]*"/);
    });
  });

  describe("Page filter chips touch-target verification", () => {
    it("events page (/events) applies tap-target to all category filter chips and uses gap-2+", () => {
      const page = readFileSync(join(ROOT, "src/app/events/page.tsx"), "utf-8");
      expect(page).toContain('cn("tap-target"');
      expect(page).toMatch(/className="mt-4 flex flex-wrap gap-2"/);
    });

    it("issues page (/issues) applies tap-target to status and category chips and uses gap-2+", () => {
      const page = readFileSync(join(ROOT, "src/app/issues/page.tsx"), "utf-8");
      expect(page).toMatch(/tap-target rounded-full/);
      expect(page).toMatch(/tap-target inline-flex/);
      expect(page).toMatch(/flex flex-wrap items-center gap-2/);
    });

    it("jobs page (/jobs) applies tap-target to category chips and uses gap-2+", () => {
      const page = readFileSync(join(ROOT, "src/app/jobs/page.tsx"), "utf-8");
      expect(page).toContain('cn("tap-target"');
      expect(page).toMatch(/flex flex-wrap gap-2/);
    });

    it("marketplace page (/marketplace) applies tap-target to category chips and uses gap-2+", () => {
      const page = readFileSync(join(ROOT, "src/app/marketplace/page.tsx"), "utf-8");
      expect(page).toContain('cn("tap-target"');
      expect(page).toMatch(/flex flex-wrap gap-2/);
    });

    it("community pages (/communities and [slug]) apply tap-target to filter chips", () => {
      const listPage = readFileSync(join(ROOT, "src/app/communities/page.tsx"), "utf-8");
      const detailPage = readFileSync(join(ROOT, "src/app/communities/[slug]/page.tsx"), "utf-8");
      expect(listPage).toContain("tap-target");
      expect(detailPage).toContain("tap-target");
    });
  });

  describe("Interactive micro-controls touch-target verification", () => {
    it("comments reaction bar buttons use tap-target", () => {
      const file = readFileSync(
        join(ROOT, "src/features/comments/components/reaction-bar.tsx"),
        "utf-8"
      );
      expect(file).toContain('className={cn("tap-target"');
    });

    it("issue status control buttons use tap-target", () => {
      const file = readFileSync(
        join(ROOT, "src/features/issues/components/status-control.tsx"),
        "utf-8"
      );
      expect(file).toContain('className={cn("tap-target"');
    });

    it("job application decision buttons use tap-target", () => {
      const file = readFileSync(
        join(ROOT, "src/features/jobs/components/application-decision.tsx"),
        "utf-8"
      );
      expect(file).toContain('className={cn("tap-target"');
    });

    it("marketplace seller controls use tap-target", () => {
      const file = readFileSync(
        join(ROOT, "src/features/marketplace/components/seller-controls.tsx"),
        "utf-8"
      );
      expect(file).toContain('className={cn("tap-target"');
    });

    it("message thread older-messages link uses tap-target", () => {
      const file = readFileSync(
        join(ROOT, "src/features/messages/components/message-thread.tsx"),
        "utf-8"
      );
      expect(file).toMatch(/className="[^"]*tap-target[^"]*"/);
    });

    it("profile social links use tap-target", () => {
      const file = readFileSync(
        join(ROOT, "src/features/profile/components/social-links.tsx"),
        "utf-8"
      );
      expect(file).toContain('className={cn("tap-target"');
    });
  });
});
