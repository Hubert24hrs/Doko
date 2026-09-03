"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, HelpCircle, X } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { RsvpStatus } from "@/types/database";

import { setRsvpAction, type EventState } from "../actions";

const INITIAL: EventState = { ok: false };

const OPTIONS = [
  { status: "going" as const, label: "Going", Icon: Check },
  { status: "interested" as const, label: "Interested", Icon: HelpCircle },
  { status: "not_going" as const, label: "Can't go", Icon: X },
];

function RsvpOption({
  status,
  label,
  Icon,
  active,
}: {
  status: string;
  label: string;
  Icon: typeof Check;
  active: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="status"
      // Pressing the option you already chose withdraws it. The value carries
      // the desired END STATE either way, so a stale render can only ever
      // repeat what the member last meant, never invert it.
      value={active ? "withdraw" : status}
      disabled={pending}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border-strong text-foreground hover:bg-surface-sunken",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Answering an event.
 *
 * Three options rather than a single "attend" button, because the honest
 * answers to a funeral are not just yes and silence. "Can't go" is worth
 * collecting and deliberately not worth displaying: the listing shows who is
 * coming, never who declined.
 */
export function RsvpButtons({
  eventId,
  status,
  disabled = false,
}: {
  eventId: string;
  status: RsvpStatus | null;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(setRsvpAction, INITIAL);

  if (disabled) {
    return (
      <p className="text-sm text-muted-foreground">
        This event has been cancelled.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        {OPTIONS.map((option) => (
          <RsvpOption
            key={option.status}
            status={option.status}
            label={option.label}
            Icon={option.Icon}
            active={status === option.status}
          />
        ))}
      </form>

      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}

      {status ? (
        <p className="text-xs text-muted-foreground">
          Press your answer again to withdraw it.
        </p>
      ) : null}
    </div>
  );
}
