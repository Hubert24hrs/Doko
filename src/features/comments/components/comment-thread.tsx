"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";

import { EditableText } from "@/components/ui/editable-text";

import {
  createCommentAction,
  deleteCommentAction,
  updateCommentAction,
  type CommentActionState,
} from "../actions";
import { COMMENT_MAX_LENGTH } from "../schemas";
import type { FeedComment } from "../queries";

const INITIAL: CommentActionState = { ok: false };

function SubmitReply({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      isLoading={pending}
      loadingLabel="Replying"
      disabled={disabled}
    >
      Reply
    </Button>
  );
}

/**
 * The textarea and its counter, isolated so a successful reply can clear both
 * by remounting via `key` — no effect writing state, no ref read in render.
 */
function ReplyBody({ error }: { error?: string }) {
  const [length, setLength] = useState(0);
  const remaining = COMMENT_MAX_LENGTH - length;

  return (
    <>
      <Field error={error}>
        <FieldLabel className="sr-only">Write a reply</FieldLabel>
        <FieldTextarea
          name="body"
          rows={2}
          maxLength={COMMENT_MAX_LENGTH + 100}
          placeholder="Write a reply…"
          onChange={(e) => setLength(e.target.value.length)}
        />
      </Field>
      <div className="flex items-center justify-end gap-3">
        {length > COMMENT_MAX_LENGTH - 200 ? (
          <span
            aria-live="polite"
            className={
              remaining < 0
                ? "text-xs font-medium tabular-nums text-danger"
                : "text-xs tabular-nums text-muted-foreground"
            }
          >
            {remaining}
          </span>
        ) : null}
        <SubmitReply disabled={length === 0 || remaining < 0} />
      </div>
    </>
  );
}

export function CommentComposer({ postId }: { postId: string }) {
  const [state, formAction] = useActionState(createCommentAction, INITIAL);

  return (
    <form action={formAction} className="space-y-2" noValidate>
      <input type="hidden" name="postId" value={postId} />
      {state.formError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.formError}
        </p>
      ) : null}
      <ReplyBody key={state.postedAt ?? "reply"} error={state.fieldErrors?.body} />
    </form>
  );
}

/**
 * A reply's text, editable in place by its author.
 *
 * Author only, for the same reason as posts: the comments guard trigger
 * restores `body` for anyone else, so a moderator's edit would silently do
 * nothing.
 */
function ReplyBodyText({
  commentId,
  postId,
  body,
  canEdit,
}: {
  commentId: string;
  postId: string;
  body: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(updateCommentAction, INITIAL);

  return (
    <>
      {state.formError ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.formError}
        </p>
      ) : null}
      <EditableText
        key={state.postedAt ?? "view"}
        body={body}
        canEdit={canEdit}
        formAction={formAction}
        hiddenFields={{ commentId, postId }}
        maxLength={COMMENT_MAX_LENGTH}
        error={state.fieldErrors?.body}
        className="mt-1 text-sm text-foreground"
        editLabel="Edit reply"
      />
    </>
  );
}

function DeleteReply({ commentId, postId }: { commentId: string; postId: string }) {
  const [state, formAction] = useActionState(deleteCommentAction, INITIAL);
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
        aria-label="Remove this reply"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-danger"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-1.5">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="postId" value={postId} />
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <Button type="submit" variant="danger" size="sm">
        Remove
      </Button>
    </form>
  );
}

export function CommentList({
  comments,
  postId,
  viewerId,
  viewerIsStaff,
}: {
  comments: FeedComment[];
  postId: string;
  viewerId: string | null;
  viewerIsStaff: boolean;
}) {
  if (comments.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No replies yet. Be the first to say something.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {comments.map((comment) => {
        const canManage =
          viewerIsStaff || (viewerId !== null && comment.author_id === viewerId);
        const when = new Date(comment.created_at);

        return (
          <li key={comment.id} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {comment.author ? (
                    <Link
                      href={`/members/${comment.author.username}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {comment.author.full_name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-foreground">
                      Former member
                    </span>
                  )}
                  {comment.author?.is_verified ? <VerifiedBadge /> : null}
                  <time
                    dateTime={comment.created_at}
                    title={when.toLocaleString("en-NG")}
                    className="text-xs text-muted-foreground"
                  >
                    {when.toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                  {comment.edited_at ? (
                    <span className="text-xs text-muted-foreground">· edited</span>
                  ) : null}
                </div>

                <ReplyBodyText
                  commentId={comment.id}
                  postId={postId}
                  body={comment.body}
                  canEdit={viewerId !== null && comment.author_id === viewerId}
                />
              </div>

              {canManage ? (
                <DeleteReply commentId={comment.id} postId={postId} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
