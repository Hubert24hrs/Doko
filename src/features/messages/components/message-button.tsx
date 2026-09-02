"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

import { openConversationAction, type MessageState } from "../actions";

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
      {pending ? null : <MessageSquare aria-hidden="true" />}
      Message
    </Button>
  );
}

/**
 * Start (or return to) a conversation with somebody.
 *
 * The action opens rather than creates: pressing this on a profile you have
 * written to before lands in the existing conversation, because the pair key
 * makes a second one impossible.
 *
 * Rendered only when the database has already said the caller may message this
 * person, so the ordinary case never shows a button that fails. That check is
 * presentation; the same rule is applied again inside the function.
 */
export function MessageButton({ otherUserId }: { otherUserId: string }) {
  const [state, formAction] = useActionState(openConversationAction, INITIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="otherUserId" value={otherUserId} />
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
