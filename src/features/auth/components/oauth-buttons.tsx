"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

type Provider = "google" | "apple";

/**
 * Brand marks are inlined rather than fetched: the Artifact/app CSP aside, a
 * sign-in button must not depend on a third-party CDN being reachable, and an
 * icon request to Google would leak the reader's IP before they have chosen
 * to sign in with Google.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 384 512" className="size-[18px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

const PROVIDERS: {
  id: Provider;
  label: string;
  mark: React.ReactNode;
  className: string;
}[] = [
  {
    id: "google",
    label: "Continue with Google",
    mark: <GoogleMark />,
    className:
      "bg-surface text-foreground border border-border-strong hover:bg-surface-sunken",
  },
  {
    id: "apple",
    label: "Continue with Apple",
    mark: <AppleMark />,
    className:
      "bg-[#000] text-white border border-black hover:bg-[#1a1a1a] dark:bg-white dark:text-black dark:border-white dark:hover:bg-[#e8e8e8]",
  },
];

export function OAuthButtons({
  next = "/home",
  className,
}: {
  /** Where to land after the provider returns. Validated server-side too. */
  next?: string;
  className?: string;
}) {
  const [pending, setPending] = React.useState<Provider | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function signIn(provider: Provider) {
    setError(null);
    setPending(provider);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // The callback route exchanges the code for a session and re-checks
          // `next` with safeRelativePath, so this cannot become an open
          // redirect even though the value round-trips through the provider.
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        // The commonest cause by far is the provider not being enabled in the
        // Supabase dashboard. Say so plainly instead of showing a raw error.
        console.error("[auth.oauth] sign-in failed", error.message);
        setError(
          `Could not continue with ${provider === "google" ? "Google" : "Apple"}. Please try again, or use your email address below.`,
        );
        setPending(null);
      }
      // On success the browser navigates away; leave the button in its
      // pending state rather than flashing back to idle.
    } catch (cause) {
      console.error("[auth.oauth] unexpected failure", cause);
      setError("Something went wrong. Please use your email address below.");
      setPending(null);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {PROVIDERS.map(({ id, label, mark, className: variant }) => (
        <button
          key={id}
          type="button"
          onClick={() => signIn(id)}
          disabled={pending !== null}
          aria-busy={pending === id || undefined}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg",
            "text-sm font-medium transition-colors",
            "disabled:pointer-events-none disabled:opacity-60",
            variant,
          )}
        >
          {pending === id ? (
            <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
          ) : (
            mark
          )}
          {label}
        </button>
      ))}
    </div>
  );
}

/** Labelled separator between the provider buttons and the email form. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
