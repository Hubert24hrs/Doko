"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { deletePostAction, type PostActionState } from "../actions";

const INITIAL: PostActionState = { ok: false };

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      size="sm"
      isLoading={pending}
      loadingLabel="Removing"
    >
      Remove
    </Button>
  );
}

/**
 * Remove control for a post.
 *
 * Deletion is confirmed inline rather than in a modal: it is reversible in
 * principle (the row is only marked deleted) and a dialog for one destructive
 * action on a feed item is more ceremony than it earns.
 */
export function PostActions({ postId }: { postId: string }) {
  const [state, formAction] = useActionState(deletePostAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  if (state.formError) {
    return (
      <p role="alert" className="text-xs text-danger">
        {state.formError}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Remove this post"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-danger"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="postId" value={postId} />
      <span className="text-xs text-muted-foreground">Remove this post?</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
      <ConfirmButton />
    </form>
  );
}
