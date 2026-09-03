"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { ListingStatus } from "@/types/database";

import {
  removeListingAction,
  setListingStatusAction,
  type ListingState,
} from "../actions";
import { LISTING_STATUS_LABEL, listingStatuses } from "../schemas";

const INITIAL: ListingState = { ok: false };

function StatusOption({
  status,
  active,
}: {
  status: ListingStatus;
  active: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending || active}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border-strong text-foreground hover:bg-surface-sunken disabled:opacity-60",
      )}
    >
      {LISTING_STATUS_LABEL[status]}
    </button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" isLoading={pending} loadingLabel="Removing">
      Yes, take it down
    </Button>
  );
}

/**
 * The seller's controls: status, and removal.
 *
 * Marking sold is a straight three-way switch rather than one "mark sold"
 * button, because a listing genuinely moves back and forth -- a reservation
 * falls through, and "available" needs to be one press away, not a second
 * control to hunt for.
 */
export function SellerControls({
  listingId,
  status,
}: {
  listingId: string;
  status: ListingStatus;
}) {
  const [statusState, statusAction] = useActionState(
    setListingStatusAction,
    INITIAL,
  );
  const [removeState, removeAction] = useActionState(removeListingAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">
        You are selling this
      </h2>

      <form action={statusAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="listingId" value={listingId} />
        {listingStatuses.map((s) => (
          <StatusOption key={s} status={s} active={status === s} />
        ))}
      </form>
      {statusState.formError ? (
        <p role="alert" className="text-xs text-danger">
          {statusState.formError}
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
          <form action={removeAction} className="space-y-2">
            <input type="hidden" name="listingId" value={listingId} />
            <p className="text-xs text-muted-foreground">
              This removes it from the site entirely. If it sold, marking it
              &ldquo;Sold&rdquo; above says so without losing the listing.
            </p>
            <div className="flex items-center gap-2">
              <RemoveButton />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Keep it
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
    </div>
  );
}
