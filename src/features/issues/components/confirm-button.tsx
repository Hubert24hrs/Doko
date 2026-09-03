"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

import { confirmIssueAction, type IssueState } from "../actions";

const INITIAL: IssueState = { ok: false };

function SubmitConfirm({ confirmed }: { confirmed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={confirmed ? "primary" : "outline"}
      isLoading={pending}
      loadingLabel="Saving"
    >
      {pending ? null : confirmed ? (
        <Check aria-hidden="true" />
      ) : (
        <Eye aria-hidden="true" />
      )}
      {confirmed ? "You confirmed this" : "I see this too"}
    </Button>
  );
}

/**
 * Confirming that somebody else's report is real.
 *
 * The count it feeds is the closest thing this platform has to a priority
 * signal: five people confirming a broken borehole is a different fact from
 * one person mentioning it, and it is the number a community leader will
 * actually act on.
 *
 * Sends the END STATE, as reactions and RSVPs do.
 */
export function ConfirmButton({
  issueId,
  confirmed,
  count,
}: {
  issueId: string;
  confirmed: boolean;
  count: number;
}) {
  const [state, formAction] = useActionState(confirmIssueAction, INITIAL);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <form action={formAction}>
          <input type="hidden" name="issueId" value={issueId} />
          <input
            type="hidden"
            name="intent"
            value={confirmed ? "withdraw" : "confirm"}
          />
          <SubmitConfirm confirmed={confirmed} />
        </form>

        <span className="text-sm text-muted-foreground">
          {count === 0
            ? "Nobody else has confirmed this yet"
            : `${count.toLocaleString("en-NG")} ${
                count === 1 ? "person has" : "people have"
              } confirmed this`}
        </span>
      </div>

      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
