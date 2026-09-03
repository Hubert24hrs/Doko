"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import type { JobApplicationRow } from "@/types/database";

import {
  applyToJobAction,
  withdrawApplicationAction,
  type JobState,
} from "../actions";
import { APPLICATION_MESSAGE_MAX, APPLICATION_STATUS_LABEL } from "../schemas";

const INITIAL: JobState = { ok: false };

function SubmitApply() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" isLoading={pending} loadingLabel="Sending">
      {pending ? null : <Send aria-hidden="true" />}
      Send application
    </Button>
  );
}

function SubmitWithdraw() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
    >
      {pending ? "Withdrawing…" : "Withdraw this application"}
    </button>
  );
}

/**
 * Applying, and the state afterwards.
 *
 * Somebody who has already applied is shown what they sent and where it
 * stands, rather than an empty box. The unique constraint refuses a second
 * application anyway, and meeting it as an error after writing a long message
 * would be a poor way to find out.
 */
export function ApplyForm({
  jobId,
  existing,
  closed,
}: {
  jobId: string;
  existing: JobApplicationRow | null;
  closed: boolean;
}) {
  const [applyState, applyAction] = useActionState(applyToJobAction, INITIAL);
  const [withdrawState, withdrawAction] = useActionState(
    withdrawApplicationAction,
    INITIAL,
  );

  if (existing && existing.status !== "withdrawn") {
    return (
      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm text-foreground">
          You applied on{" "}
          {new Date(existing.created_at).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          . Status:{" "}
          <strong className="font-semibold">
            {APPLICATION_STATUS_LABEL[existing.status]}
          </strong>
          .
        </p>
        {existing.message ? (
          <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-sunken px-3 py-2 text-sm text-muted-foreground">
            {existing.message}
          </p>
        ) : null}

        <form action={withdrawAction}>
          <input type="hidden" name="applicationId" value={existing.id} />
          <input type="hidden" name="jobId" value={jobId} />
          <SubmitWithdraw />
        </form>
        {withdrawState.formError ? (
          <p role="alert" className="text-xs text-danger">
            {withdrawState.formError}
          </p>
        ) : null}
      </div>
    );
  }

  if (closed) {
    return (
      <p className="text-sm text-muted-foreground">
        This job is no longer taking applications.
      </p>
    );
  }

  return (
    <form action={applyAction} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />

      {applyState.formError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {applyState.formError}
        </p>
      ) : null}

      <Field error={applyState.fieldErrors?.message}>
        <FieldLabel required>Why you</FieldLabel>
        <FieldTextarea
          name="message"
          rows={5}
          required
          maxLength={APPLICATION_MESSAGE_MAX}
          placeholder="What you have done before, and when you could start."
        />
        <FieldDescription>
          Only the person who posted this job can read your application.
        </FieldDescription>
      </Field>

      <SubmitApply />
    </form>
  );
}
