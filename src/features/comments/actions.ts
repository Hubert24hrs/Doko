"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  createCommentSchema,
  deleteCommentSchema,
  setReactionSchema,
  updateCommentSchema,
} from "./schemas";

export interface CommentActionState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  /** Fresh on each success, so the composer can clear itself by remounting. */
  postedAt?: string;
}

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

export async function createCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const user = await requireUser("/feed");

  const parsed = createCommentSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `comment:${user.id}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `You have replied a lot in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({
    post_id: parsed.data.postId,
    author_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    console.error("[comments.create] failed", error.message);
    // The INSERT policy requires an active member AND a visible, undeleted
    // post, so 42501 covers suspension and commenting on something you cannot
    // see or that has been removed.
    if (error.code === "42501") {
      return {
        ok: false,
        formError: "You cannot reply to this post.",
      };
    }
    return { ok: false, formError: "Your reply could not be saved." };
  }

  revalidatePath(`/posts/${parsed.data.postId}`);
  revalidatePath("/feed");
  return { ok: true, postedAt: new Date().toISOString() };
}

/**
 * Edit one's own reply.
 *
 * The database is already set up for this: comments_update_own permits it, and
 * the guard trigger stamps edited_at when the author changes the body while
 * restoring it for anyone else. Only the way in was missing, which meant the
 * "edited" label in the UI described a state nothing could produce.
 */
export async function updateCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  await requireUser("/feed");

  const parsed = updateCommentSchema.safeParse({
    commentId: formData.get("commentId"),
    postId: formData.get("postId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.commentId);

  if (error) {
    console.error("[comments.update] failed", error.message);
    return { ok: false, formError: "Your edit could not be saved." };
  }

  revalidatePath(`/posts/${parsed.data.postId}`);
  revalidatePath("/feed");
  return { ok: true, postedAt: new Date().toISOString() };
}

export async function deleteCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  await requireUser("/feed");

  const parsed = deleteCommentSchema.safeParse({
    commentId: formData.get("commentId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That reply could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.commentId);

  if (error) {
    console.error("[comments.delete] failed", error.message);
    return { ok: false, formError: "The reply could not be removed." };
  }

  const postId = formData.get("postId");
  if (typeof postId === "string") revalidatePath(`/posts/${postId}`);
  revalidatePath("/feed");
  return { ok: true };
}

/**
 * Set, change, or clear the caller's reaction to a post.
 *
 * Deliberately a toggle rather than separate add/remove actions: the client
 * sends the kind it wants, and sending the kind you already have removes it.
 * That keeps the one-per-person unique constraint satisfied without the client
 * having to track its own current state, and makes the operation idempotent
 * from the caller's point of view.
 */
export async function setReactionAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const user = await requireUser("/feed");

  const parsed = setReactionSchema.safeParse({
    postId: formData.get("postId"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That reaction is not available." };
  }

  const supabase = await createClient();
  const { postId, kind } = parsed.data;

  const { data: existing, error: readError } = await supabase
    .from("reactions")
    .select("id, kind")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    console.error("[reactions.set] read failed", readError.message);
    return { ok: false, formError: "Your reaction could not be saved." };
  }

  let error = null;

  if (!existing) {
    ({ error } = await supabase
      .from("reactions")
      .insert({ post_id: postId, user_id: user.id, kind }));
  } else if (existing.kind === kind) {
    // Same reaction again means "take it back".
    ({ error } = await supabase.from("reactions").delete().eq("id", existing.id));
  } else {
    ({ error } = await supabase
      .from("reactions")
      .update({ kind })
      .eq("id", existing.id));
  }

  if (error) {
    console.error("[reactions.set] write failed", error.message);
    return { ok: false, formError: "Your reaction could not be saved." };
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/feed");
  return { ok: true };
}
