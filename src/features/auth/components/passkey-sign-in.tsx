"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { signInWithPlatformPasskey } from "../passkey-ceremony";
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

  React.useEffect(() => {
    let cancelled = false;

    async function detect() {
      // Two separate checks: WebAuthn at all, then specifically a *platform*
      // authenticator (Touch ID, Windows Hello, Android biometrics) rather
      // than a roaming USB key, since the label promises biometrics.
      if (
        typeof window === "undefined" ||
        typeof window.PublicKeyCredential === "undefined" ||
        typeof window.PublicKeyCredential
          .isUserVerifyingPlatformAuthenticatorAvailable !== "function"
      ) {
        return;
      }

      try {
        const ok =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!cancelled) setAvailable(ok);
      } catch {
        // Some browsers reject this in insecure contexts. Treat as absent.
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  async function signIn() {
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await signInWithPlatformPasskey(supabase);

      if (error) {
        console.error("[auth.passkey] sign-in failed", error);
        setError(
          "No passkey was found for this device. Sign in another way, then add one from settings.",
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
