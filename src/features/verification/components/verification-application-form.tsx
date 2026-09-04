"use client";

import * as React from "react";
import { useActionState } from "react";
import { ShieldCheck, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

import { submitVerificationRequestAction, type VerificationActionState } from "../actions";
import { VerifiedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldInput, FieldTextarea } from "@/components/ui/field";

const initialState: VerificationActionState = { ok: false };

export function VerificationApplicationForm() {
  const [state, formAction, isPending] = useActionState(
    submitVerificationRequestAction,
    initialState,
  );
  const [selectedTier, setSelectedTier] = React.useState<"blue" | "gold">("gold");

  if (state.ok) {
    return (
      <div className="rounded-xl border border-eo-green-200 bg-eo-green-50/60 p-6 text-center dark:border-eo-green-800 dark:bg-eo-green-950/30">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-eo-green-100 text-eo-green-600 dark:bg-eo-green-900/50 dark:text-eo-green-400">
          <CheckCircle2 className="size-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">
          Verification Request Submitted
        </h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Your application for{" "}
          <strong className={selectedTier === "gold" ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"}>
            {selectedTier === "gold" ? "Golden Verification" : "Blue Verification"}
          </strong>{" "}
          has been queued for administrative review. You will be notified once reviewed.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.formError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{state.formError}</span>
        </div>
      )}

      {/* Tier Selection */}
      <div>
        <label className="text-sm font-semibold text-foreground">
          Select Verification Tier
        </label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose the tier that corresponds to your community role.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* Gold Option */}
          <label
            className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all ${
              selectedTier === "gold"
                ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20 shadow-xs"
                : "border-border hover:border-border-strong bg-surface"
            }`}
          >
            <input
              type="radio"
              name="tier"
              value="gold"
              checked={selectedTier === "gold"}
              onChange={() => setSelectedTier("gold")}
              className="sr-only"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Sparkles className="size-4" />
                </span>
                <span className="font-semibold text-sm text-foreground">
                  Golden Verification
                </span>
              </div>
              <VerifiedBadge type="gold" ticker label="Official" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              For office holders, traditional leaders, elders, prominent figures, and distinguished patrons.
            </p>
          </label>

          {/* Blue Option */}
          <label
            className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all ${
              selectedTier === "blue"
                ? "border-sky-500 bg-sky-500/5 ring-2 ring-sky-500/20 shadow-xs"
                : "border-border hover:border-border-strong bg-surface"
            }`}
          >
            <input
              type="radio"
              name="tier"
              value="blue"
              checked={selectedTier === "blue"}
              onChange={() => setSelectedTier("blue")}
              className="sr-only"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="font-semibold text-sm text-foreground">
                  Blue Verification
                </span>
              </div>
              <VerifiedBadge type="blue" ticker label="Verified" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              For regular active members, youths, artisans, and community contributors.
            </p>
          </label>
        </div>
      </div>

      {/* Organization / Office */}
      <Field>
        <FieldLabel>
          Organization / Institution / Office (Optional)
        </FieldLabel>
        <FieldInput
          id="organization"
          name="organization"
          placeholder="e.g. Igbo Eze North LGA Council, Enugu Ezike Youth Association"
          maxLength={120}
        />
      </Field>

      {/* Role / Title */}
      <Field>
        <FieldLabel>
          Official Role / Community Title (Optional)
        </FieldLabel>
        <FieldInput
          id="roleTitle"
          name="roleTitle"
          placeholder="e.g. Councilor, Patron, President, Elder, Resident"
          maxLength={120}
        />
      </Field>

      {/* Notes / Supporting Context */}
      <Field>
        <FieldLabel>
          Statement / Notes for Administrators
        </FieldLabel>
        <FieldTextarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Briefly state your community involvement, village, or reason for verification..."
          maxLength={1000}
        />
      </Field>

      {/* Notice regarding future requirements */}
      <div className="rounded-lg border border-border bg-surface-sunken p-3 text-xs text-muted-foreground">
        <p>
          <strong>Note:</strong> Detailed verification requirements and credential uploads will be published here soon. Submitting this form registers your application with the Igbo Eze North administration for preliminary verification.
        </p>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary-hover font-semibold px-6"
      >
        {isPending ? "Submitting Application..." : "Submit Verification Request"}
      </Button>
    </form>
  );
}
