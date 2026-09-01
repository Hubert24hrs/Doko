"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { loginAction, type AuthActionState } from "../actions";

const INITIAL: AuthActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      isLoading={pending}
      loadingLabel="Signing you in"
    >
      Sign in
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Where to land after signing in. Re-validated server-side. */}
      <input type="hidden" name="next" value={next} />
      {state.formError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </div>
      ) : null}

      <Field error={state.fieldErrors?.email}>
        <FieldLabel required>Email</FieldLabel>
        <FieldInput
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Field error={state.fieldErrors?.password}>
        <FieldLabel required>Password</FieldLabel>
        <PasswordField
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
