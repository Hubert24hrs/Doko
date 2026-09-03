"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils/cn";
import type { ApplicationStatus } from "@/types/database";

import { decideApplicationAction, type JobState } from "../actions";

const INITIAL: JobState = { ok: false };

const CHOICES: { status: ApplicationStatus; label: string }[] = [
  { status: "shortlisted", label: "Shortlist" },
  { status: "rejected", label: "Not selected" },
  { status: "sent", label: "Undecided" },
];

function Choice({
  status,
  label,
  active,
}: {
  status: string;
  label: string;
  active: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border-strong text-foreground hover:bg-surface-sunken",
      )}
    >
      {label}
    </button>
  );
}

/**
 * The employer's decision on one application.
 *
 * "Undecided" exists so a decision can be taken BACK. Shortlisting the wrong
 * person and having no way to undo it would make the control something people
 * are afraid to touch.
 *
 * Nothing is sent to the applicant from here; the status simply becomes
 * visible on their own page when they look. That is deliberate -- a rejection
 * arriving as a notification is a worse way to hear it than finding it when
 * you go looking for it.
 */
export function ApplicationDecision({
  applicationId,
  jobId,
  status,
}: {
  applicationId: string;
  jobId: string;
  status: ApplicationStatus;
}) {
  const [state, formAction] = useActionState(decideApplicationAction, INITIAL);

  if (status === "withdrawn") {
    return (
      <p className="text-xs text-muted-foreground">
        This application was withdrawn.
      </p>
    );
  }

  return (
    <div>
      <form action={formAction} className="flex flex-wrap gap-1.5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="jobId" value={jobId} />
        {CHOICES.map((choice) => (
          <Choice
            key={choice.status}
            status={choice.status}
            label={choice.label}
            active={status === choice.status}
          />
        ))}
      </form>
      {state.formError ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
