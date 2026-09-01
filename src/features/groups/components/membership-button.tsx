"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LogOut, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GroupRole } from "@/types/database";

import { setMembershipAction, type GroupActionState } from "../actions";

const INITIAL: GroupActionState = { ok: false };

function SubmitMembership({ isMember }: { isMember: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={isMember ? "outline" : "primary"}
      isLoading={pending}
      loadingLabel={isMember ? "Leaving" : "Joining"}
    >
      {pending ? null : isMember ? (
        <LogOut aria-hidden="true" />
      ) : (
        <UserPlus aria-hidden="true" />
      )}
      {isMember ? "Leave group" : "Join group"}
    </Button>
  );
}

/**
 * Join / leave control.
 *
 * Sends the desired end state rather than toggling, for the same reason as
 * following: a toggle read from stale UI does the opposite of what the member
 * meant.
 *
 * The sole owner is shown a disabled control with the reason, rather than a
 * button that fails. The database enforces this regardless — the last-owner
 * guard raises rather than filtering — but a member should not have to press
 * something to learn they cannot.
 */
export function MembershipButton({
  groupId,
  slug,
  role,
  isSoleOwner,
}: {
  groupId: string;
  slug: string;
  role: GroupRole | null;
  isSoleOwner: boolean;
}) {
  const [state, formAction] = useActionState(setMembershipAction, INITIAL);
  const isMember = role !== null;

  if (isMember && isSoleOwner) {
    return (
      <div className="text-right">
        <Button type="button" size="sm" variant="outline" disabled>
          Leave group
        </Button>
        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
          You are the only owner. Make somebody else an owner first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="intent" value={isMember ? "leave" : "join"} />
        <SubmitMembership isMember={isMember} />
      </form>

      {state.formError ? (
        <p role="alert" className="max-w-[18rem] text-right text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
