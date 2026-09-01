"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

import { Logo } from "@/components/brand/logo";

/**
 * Route-level error boundary.
 *
 * Shows no stack trace and no error message from the exception. In production
 * Next.js already redacts server errors, but the digest is the only thing
 * worth surfacing anyway: it is the id that ties this page to the actual
 * error in the server logs, and a member can quote it when reporting a
 * problem. Anything more risks leaking internals to whoever triggered it.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reaches the platform's logs. Replace with a reporting service when one
    // exists; the shape of the call stays the same.
    console.error("[error-boundary]", error.digest ?? error.message);
  }, [error]);

  return (
    <main
      id="main"
      className="flex flex-1 items-center justify-center px-4 py-16"
    >
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 inline-flex rounded-lg">
          <Logo />
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is our fault, not yours. Trying again often works — the problem
          is usually a brief connection issue.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <RotateCw className="size-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
          >
            Go to the homepage
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-8 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
