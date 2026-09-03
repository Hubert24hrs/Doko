"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  signInWithPlatformPasskey,
  isConditionalMediationAvailable,
} from "../passkey-ceremony";
import { cn } from "@/lib/utils/cn";

/**
 * Biometric sign-in, which on the web means a passkey (WebAuthn).
 *
 * The fingerprint or face scan never leaves the device and is never sent to
 * us: it unlocks a private key held in the device's secure hardware, which
 * signs a challenge from the auth server. There is no password to phish and
 * nothing shared to leak.
 *
 * The button renders only when the device actually has a platform
 * authenticator, so a desktop without biometrics never sees an option it
 * cannot honour.
 *
 * When conditional mediation is available (Chrome 108+, Safari 16+, Edge 108+)
 * the ceremony is started immediately on mount so passkeys appear in the
 * browser's autofill dropdown. The button click becomes the visual fallback for
 * browsers that do not support it. An AbortController cancels any in-flight
 * conditional request before starting a new explicit one.
 */
export function PasskeySignIn({
  next = "/home",
  className,
}: {
  next?: string;
  className?: string;
}) {
  const router = useRouter();
  const [available, setAvailable] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Kept in a ref so the cleanup function can cancel a conditional ceremony
  // that is waiting in the background.
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function setup() {
      // Step 1: does the device have a biometric authenticator at all?
      if (
        typeof window === "undefined" ||
        typeof window.PublicKeyCredential === "undefined" ||
        typeof window.PublicKeyCredential
          .isUserVerifyingPlatformAuthenticatorAvailable !== "function"
      ) {
        return;
      }

      let hasPlatform = false;
      try {
        hasPlatform =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        return; // Insecure context or a browser that refuses the query.
      }

      if (!hasPlatform || cancelled) return;
      setAvailable(true);

      // Step 2: if the browser supports conditional mediation, kick off the
      // ceremony immediately so passkeys surface in the autofill dropdown.
      const conditional = await isConditionalMediationAvailable();
      if (!conditional || cancelled) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const supabase = createClient();
        const { error } = await signInWithPlatformPasskey(supabase, {
          signal: controller.signal,
          mediation: "conditional",
        });

        if (cancelled) return;

        if (!error) {
          router.push(next);
          router.refresh();
        }
        // Conditional failures are silent — the user just did not pick a
        // passkey from autofill, which is a normal non-action.
      } catch (cause) {
        // AbortError means the page unmounted or the button was clicked —
        // expected, not worth logging.
        if ((cause as { name?: string })?.name === "AbortError") return;
        console.error("[auth.passkey] conditional ceremony error", cause);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [next, router]);

  if (!available) return null;

  async function signIn() {
    setError(null);
    setPending(true);

    // Cancel any background conditional ceremony before starting an explicit one.
    abortRef.current?.abort();
    abortRef.current = null;

    try {
      const supabase = createClient();
      const { error } = await signInWithPlatformPasskey(supabase, {
        mediation: "required",
      });

      if (error) {
        console.error("[auth.passkey] sign-in failed", error);
        setError(
          "No passkey was found for this device. Sign in another way, then add one from Settings.",
        );
        setPending(false);
        return;
      }

      router.push(next);
      router.refresh();
    } catch (cause) {
      // The commonest path here is the member dismissing the system prompt,
      // which is a normal choice and not worth an alarming message.
      const name = (cause as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "AbortError") {
        setPending(false);
        return;
      }
      console.error("[auth.passkey] unexpected failure", cause);
      setError("Biometric sign-in is unavailable right now. Please use another method.");
      setPending(false);
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

      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg",
          "border border-primary/40 bg-eo-green-50 text-sm font-medium text-primary",
          "transition-colors hover:bg-eo-green-100",
          "disabled:pointer-events-none disabled:opacity-60",
        )}
      >
        {pending ? (
          <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
        ) : (
          <Fingerprint className="size-[18px]" aria-hidden="true" />
        )}
        Sign in with fingerprint or Face ID
      </button>
    </div>
  );
}
