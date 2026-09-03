"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MessagesSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

import { openGroupConversationAction, type MessageState } from "../actions";

const INITIAL: MessageState = { ok: false };

function OpenButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      isLoading={pending}
      loadingLabel="Opening"
    >
      {pending ? null : <MessagesSquare aria-hidden="true" />}
      Group chat
    </Button>
  );
}

/**
 * Open a group's conversation.
 *
 * Rendered only for members. Membership is checked again in the database --
 * reading a public group does not entitle you to its chat, for the same reason
 * it does not entitle you to post in it.
 */
export function GroupChatButton({ groupId }: { groupId: string }) {
  const [state, formAction] = useActionState(openGroupConversationAction, INITIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="groupId" value={groupId} />
        <OpenButton />
      </form>
      {state.formError ? (
        <p role="alert" className="max-w-[18rem] text-right text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
