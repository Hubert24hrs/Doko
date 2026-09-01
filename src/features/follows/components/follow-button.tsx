"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { UserMinus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setFollowAction, type FollowActionState } from "../actions";

const INITIAL: FollowActionState = { ok: false };

function SubmitFollow({ following }: { following: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={following ? "outline" : "primary"}
      isLoading={pending}
      loadingLabel={following ? "Unfollowing" : "Following"}
    >
      {pending ? null : following ? (
        <UserMinus aria-hidden="true" />
      ) : (
        <UserPlus aria-hidden="true" />
      )}
      {following ? "Following" : "Follow"}
    </Button>
  );
}

/**
 * Follow / unfollow control.
 *
 * Sends the DESIRED END STATE rather than toggling. A toggle read from stale
 * UI does the opposite of what the member meant — a double click would follow
 * and then immediately unfollow — whereas an explicit intent is idempotent.
 *
 * The label reads "Following" once active rather than "Unfollow", which is
 * what the button would do. That is deliberate: the label describes the
 * current state, and the icon plus hover carry the action, which is the
 * convention people already expect from this control.
 */
export function FollowButton({
  profileId,
  username,
  following,
}: {
  profileId: string;
  username: string;
  following: boolean;
}) {
  const [state, formAction] = useActionState(setFollowAction, INITIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="profileId" value={profileId} />
        <input type="hidden" name="username" value={username} />
        <input
          type="hidden"
          name="intent"
          value={following ? "unfollow" : "follow"}
        />
        <SubmitFollow following={following} />
      </form>

      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
