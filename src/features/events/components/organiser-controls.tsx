"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarX, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import {
  cancelEventAction,
  deleteEventAction,
  type EventState,
} from "../actions";
import { EVENT_REASON_MAX } from "../schemas";

const INITIAL: EventState = { ok: false };

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" isLoading={pending} loadingLabel={busy}>
      {label}
    </Button>
  );
}

/**
 * Cancelling and removing, kept as two different acts.
 *
 * Cancelling is the one an organiser almost always wants: people have arranged
 * their day around this, and they need to be TOLD. Removing it outright would
 * leave them turning up to nothing with no explanation, so it sits behind a
 * second click and is offered second.
 */
export function OrganiserControls({
  eventId,
  cancelled,
}: {
  eventId: string;
  cancelled: boolean;
}) {
  const [cancelState, cancelAction] = useActionState(cancelEventAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteEventAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Organiser</h2>

      {!cancelled ? (
        <form action={cancelAction} className="space-y-2">
          <input type="hidden" name="eventId" value={eventId} />
          <Field error={cancelState.fieldErrors?.reason}>
            <FieldLabel>Cancel, and say why</FieldLabel>
            <FieldInput
              name="reason"
              maxLength={EVENT_REASON_MAX}
              placeholder="Postponed until after the rains"
            />
          </Field>
          <div className="flex items-center gap-2">
            <CalendarX className="size-4 text-muted-foreground" aria-hidden="true" />
            <Pending label="Cancel event" busy="Cancelling" />
          </div>
          {cancelState.formError ? (
            <p role="alert" className="text-xs text-danger">
              {cancelState.formError}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          This event is cancelled. It stays listed so that people who planned
          around it can see what happened.
        </p>
      )}

      <div className="border-t border-border pt-3">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove it completely
          </button>
        ) : (
          <form action={deleteAction} className="space-y-2">
            <input type="hidden" name="eventId" value={eventId} />
            <p className="text-xs text-muted-foreground">
              Removing takes it off the site entirely. If people were coming,
              cancelling tells them; removing does not.
            </p>
            <div className="flex items-center gap-2">
              <Pending label="Yes, remove it" busy="Removing" />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Keep it
              </button>
            </div>
            {deleteState.formError ? (
              <p role="alert" className="text-xs text-danger">
                {deleteState.formError}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
