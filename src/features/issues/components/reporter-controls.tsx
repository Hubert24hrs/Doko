"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { removeIssueAction, type IssueState } from "../actions";

const INITIAL: IssueState = { ok: false };

function WithdrawButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      isLoading={pending}
      loadingLabel="Withdrawing"
      className="border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
    >
      Yes, withdraw this report
    </Button>
  );
}

export function ReporterControls({ issueId }: { issueId: string }) {
  const [removeState, removeAction] = useActionState(removeIssueAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-t border-border pt-6">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Withdraw this report
        </button>
      ) : (
        <form action={removeAction} className="space-y-3 rounded-lg border border-border p-4">
          <input type="hidden" name="issueId" value={issueId} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Withdraw this report
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This will remove the issue from the community board.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <WithdrawButton />
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Keep report
            </button>
          </div>

          {removeState.formError ? (
            <p role="alert" className="text-xs text-danger">
              {removeState.formError}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
