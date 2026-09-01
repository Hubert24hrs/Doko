"use client";

import * as React from "react";
import { Fingerprint, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { registerPlatformPasskey } from "../passkey-ceremony";
import { Button } from "@/components/ui/button";

/**
 * Adds a passkey to the signed-in member's account, so they can use their
 * fingerprint or Face ID next time instead of a password.
 *
 * Enrolment is per device: a passkey created on a phone does not exist on a
 * laptop. That is a property of the technology, not a limitation worth hiding,
 * so the copy says so plainly.
 */
export function PasskeyEnrollment() {
  const [available, setAvailable] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function detect() {
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
        // Insecure context or a browser that refuses the query. Treat as absent.
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enroll() {
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await registerPlatformPasskey(supabase);

      if (error) {
        console.error("[auth.passkey] enrolment failed", error);
        setError("Could not add a passkey on this device. Please try again.");
        setPending(false);
        return;
      }

      setDone(true);
      setPending(false);
    } catch (cause) {
      const name = (cause as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "AbortError") {
        setPending(false);
        return; // Dismissed the system prompt; a normal choice.
      }
      console.error("[auth.passkey] unexpected enrolment failure", cause);
      setError("Could not add a passkey on this device. Please try again.");
      setPending(false);
    }
  }

  if (!available) {
    return (
      <p className="text-sm text-muted-foreground">
        This device does not offer fingerprint or Face ID sign-in. You can set
        it up later on a phone or a laptop that does.
      </p>
    );
  }

  if (done) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm font-medium text-primary"
      >
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        Passkey added. You can now sign in on this device with your fingerprint
        or Face ID.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={enroll}
        isLoading={pending}
        loadingLabel="Adding passkey"
      >
        {pending ? null : <Fingerprint aria-hidden="true" />}
        Add fingerprint or Face ID
      </Button>

      <p className="text-xs text-muted-foreground">
        Your fingerprint never leaves this device and is never sent to Ezike
        Oba — it unlocks a key the device holds. Depending on your browser the
        passkey may sync to your Google or Apple account and work on your other
        devices; otherwise add one on each device you use.
      </p>
    </div>
  );
}
