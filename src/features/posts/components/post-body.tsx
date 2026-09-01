"use client";

import { useActionState } from "react";

import { EditableText } from "@/components/ui/editable-text";

import { updatePostAction, type PostActionState } from "../actions";
import { POST_MAX_LENGTH } from "../schemas";

const INITIAL: PostActionState = { ok: false };

/**
 * A post's text, editable in place by its author.
 *
 * Only the author, never a moderator: the posts guard trigger restores `body`
 * for anyone who is not the author, so a moderator's edit would silently do
 * nothing. Offering them a control that cannot work would be worse than not
 * offering it.
 */
export function PostBody({
  postId,
  body,
  canEdit,
}: {
  postId: string;
  body: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(updatePostAction, INITIAL);

  return (
    <>
      {state.formError ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {state.formError}
        </p>
      ) : null}

      {/*
        `key` closes the editor after a successful save: each success carries a
        fresh timestamp, so this subtree remounts with `editing` back to false
        and the revalidated body already in props.
      */}
      <EditableText
        key={state.postedAt ?? "view"}
        body={body}
        canEdit={canEdit}
        formAction={formAction}
        hiddenFields={{ postId }}
        maxLength={POST_MAX_LENGTH}
        error={state.fieldErrors?.body}
        className="mt-3 text-foreground"
        editLabel="Edit post"
      />
    </>
  );
}
