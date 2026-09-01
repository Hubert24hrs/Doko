"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import {
  Field,
  FieldDescription,
  FieldInput,
  FieldLabel,
  FieldSelect,
} from "@/components/ui/field";
import type { VillageOption } from "@/features/geo/queries";

import { registerAction, type AuthActionState } from "../actions";

const INITIAL: AuthActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      isLoading={pending}
      loadingLabel="Creating your account"
    >
      Create account
    </Button>
  );
}

export function RegisterForm({ villages }: { villages: VillageOption[] }) {
  const [state, formAction] = useActionState(registerAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.formError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </div>
      ) : null}

      <Field error={errors.fullName}>
        <FieldLabel required>Full name</FieldLabel>
        <FieldInput
          name="fullName"
          autoComplete="name"
          required
          placeholder="Chidera Eze"
        />
      </Field>

      <Field error={errors.username}>
        <FieldLabel required>Username</FieldLabel>
        <FieldInput
          name="username"
          autoComplete="username"
          required
          placeholder="chidera_eze"
        />
        <FieldDescription>
          Lowercase letters, numbers and underscores. This is how people find
          you.
        </FieldDescription>
      </Field>

      <Field error={errors.email}>
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

      <Field error={errors.phone}>
        <FieldLabel>Phone number</FieldLabel>
        <FieldInput
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="08031234567"
        />
        <FieldDescription>Optional.</FieldDescription>
      </Field>

      <Field error={errors.villageId}>
        <FieldLabel>Your village</FieldLabel>
        <FieldSelect name="villageId" defaultValue="">
          <option value="">Prefer not to say</option>
          {villages.map((village) => (
            <option key={village.id} value={village.id}>
              {village.name}
              {village.districtName ? ` — ${village.districtName}` : ""}
            </option>
          ))}
        </FieldSelect>
        <FieldDescription>
          Optional. You can explore every community either way, and change this
          later.
        </FieldDescription>
      </Field>

      <Field error={errors.password}>
        <FieldLabel required>Password</FieldLabel>
        <PasswordField
          name="password"
          autoComplete="new-password"
          required
        />
        <FieldDescription>
          At least 10 characters, with an uppercase letter, a lowercase letter
          and a number.
        </FieldDescription>
      </Field>

      <Field error={errors.confirmPassword}>
        <FieldLabel required>Confirm password</FieldLabel>
        <PasswordField
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </Field>

      <div className="space-y-3 rounded-lg border border-border bg-surface-sunken/50 p-4">
        <Checkbox
          name="isRealPerson"
          error={errors.isRealPerson}
          label="I confirm this account represents me, a real person."
        />
        <Checkbox
          name="acceptTerms"
          error={errors.acceptTerms}
          label="I accept the Ezike Oba community guidelines."
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function Checkbox({
  name,
  label,
  error,
}: {
  name: string;
  label: string;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          name={name}
          className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-[color:var(--primary)]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
