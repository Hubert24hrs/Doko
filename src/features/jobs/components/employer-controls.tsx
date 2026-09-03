"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { setJobStateAction, type JobState } from "../actions";

const INITIAL: JobState = { ok: false };

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      isLoading={pending}
      loadingLabel={busy}
    >
      {label}
    </Button>
  );
}

/**
 * The employer's controls.
 *
 * "Filled" is offered first and plainly; removal sits behind a confirmation.
 * A vacancy that simply disappears tells the people who applied nothing at
 * all, while one marked filled tells them what happened -- and this is a
 * community where those people will meet the employer at the market.
 */
export function EmployerControls({
  jobId,
  filled,
  applicationCount,
}: {
  jobId: string;
  filled: boolean;
  applicationCount: number;
}) {
  const [state, formAction] = useActionState(setJobStateAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          You posted this job
        </h2>
        <Link
          href={`/jobs/${jobId}/applications`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {applicationCount.toLocaleString("en-NG")}{" "}
          {applicationCount === 1 ? "application" : "applications"}
        </Link>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="intent" value={filled ? "reopen" : "fill"} />
        <Pending
          label={filled ? "Reopen this job" : "Mark as filled"}
          busy={filled ? "Reopening" : "Updating"}
        />
        <span className="text-xs text-muted-foreground">
          {filled
            ? "It stays listed so applicants can see it was filled."
            : "It stays listed, marked filled, so applicants know."}
        </span>
      </form>

      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}

      <div className="border-t border-border pt-3">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
          >
            Take it down completely
          </button>
        ) : (
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="intent" value="remove" />
            <p className="text-xs text-muted-foreground">
              Taking it down removes it from the site. If people applied,
              marking it filled tells them what happened; this does not.
            </p>
            <div className="flex items-center gap-2">
              <Pending label="Yes, take it down" busy="Removing" />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Keep it
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
