import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * Also reached deliberately: a post that exists but is not visible to this
 * viewer is served as 404 rather than 403, because a 403 would confirm the
 * post exists. So the wording avoids insisting the page is definitely gone.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="flex flex-1 items-center justify-center px-4 py-16"
    >
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 inline-flex rounded-lg">
          <Logo />
        </Link>

        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          We could not find that page
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link may be wrong. If you were
          following a link to something in a particular community, you may need
          to sign in to see it.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Go to the homepage
          </Link>
          <Link
            href="/communities"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
          >
            <Compass className="size-4" aria-hidden="true" />
            Browse communities
          </Link>
        </div>
      </div>
    </main>
  );
}
