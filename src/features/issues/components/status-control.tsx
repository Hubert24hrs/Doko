"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldInput, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";
import type { IssueStatus } from "@/types/database";

import { setIssueStatusAction, type IssueState } from "../actions";
import {
  ISSUE_STATUS_LABEL,
  ISSUE_STATUS_NOTE_MAX,
  issueStatuses,
} from "../schemas";

const INITIAL: IssueState = { ok: false };

function StatusOption({
  status,
  active,
}: {
  status: IssueStatus;
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
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border-strong text-foreground hover:bg-surface-sunken",
      )}
    >
      {ISSUE_STATUS_LABEL[status]}
    </button>
  );
}

/**
 * Moving an issue's status, for whoever administers the place it is in.
 *
 * The note travels with the status change rather than being a separate step,
 * because a status that moved with no explanation is the thing people
 * complain about in every system that has one -- particularly "Not being
 * taken up", which is unbearable without a reason attached.
 */
export function StatusControl({
  issueId,
  status,
  note,
}: {
  issueId: string;
  status: IssueStatus;
  note: string | null;
}) {
  const [state, formAction] = useActionState(setIssueStatusAction, INITIAL);
  const [draft, setDraft] = useState(note ?? "");

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          You can update this
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          You administer this community, so the status here is yours to move.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="issueId" value={issueId} />

        <Field error={state.fieldErrors?.note}>
          <FieldLabel>What should people know</FieldLabel>
          <FieldInput
            name="note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={ISSUE_STATUS_NOTE_MAX}
            placeholder="The council has been told; work starts next week."
          />
          <FieldDescription>
            Shown with the status. A change with no explanation is worse than
            no change.
          </FieldDescription>
        </Field>

        <div className="flex flex-wrap gap-2">
          {issueStatuses.map((s) => (
            <StatusOption key={s} status={s} active={status === s} />
          ))}
        </div>
      </form>

      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
