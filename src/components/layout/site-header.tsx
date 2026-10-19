import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";

/**
 * The site header, as one component.
 *
 * Until 2026-10-19 every page wrote its own header inline, and some twenty
 * copies exist. The pages built later -- /projects, /ai, /verification and the
 * payment return page -- were written without one at all, and without a
 * <main> either, so the root layout's skip link pointed at nothing and a
 * visitor arriving on them from the landing page or the sitemap had no way to
 * navigate anywhere. The rendered-page tests found all four.
 *
 * New pages should use this rather than paste another copy. The older inline
 * headers are equivalent and can move over when those pages are next touched.
 */
export async function SiteHeader({ width = "max-w-4xl" }: { width?: string }) {
  const viewer = await getSessionUser();

  return (
    <header className="border-b border-border">
      <div className={`mx-auto flex ${width} items-center justify-between gap-4 px-4 py-4`}>
        <Link href={viewer ? "/home" : "/"} className="rounded-lg">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/communities"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken sm:inline-flex"
          >
            Communities
          </Link>
          <Link
            href={viewer ? "/feed" : "/login"}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            {viewer ? "Feed" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}
