"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  attachMediaSchema,
  detachMediaSchema,
  updateAltTextSchema,
} from "./media";

export interface MediaActionState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  changedAt?: string;
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

/**
 * Record an image the client has already uploaded to storage.
 *
 * The upload itself happens from the browser straight to Supabase Storage,
 * where the bucket's own policies decide whether it is allowed. This action
 * only records what landed — and it re-validates everything, because the
 * client is describing its own upload and could describe it wrongly.
 *
 * If the row insert fails, the object is removed again. Leaving an orphan
 * would mean paying to store bytes nothing references and nobody can see.
 */
export async function attachMediaAction(input: {
  postId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
}): Promise<MediaActionState> {
  const user = await requireUser("/feed");

  const parsed = attachMediaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `media:${user.id}`,
    limit: 80,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many uploads in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_media")
    .insert({
      post_id: parsed.data.postId,
      storage_path: parsed.data.storagePath,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.byteSize,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      alt_text: parsed.data.altText ?? null,
    })
    .select("id");

  if (error || !data || data.length === 0) {
    console.error("[media.attach] insert failed", error?.message);

    // Do not leave the bytes behind. Best effort: if this also fails the
    // object is orphaned, which is why the log line matters.
    const { error: cleanupError } = await supabase.storage
      .from("post-media")
      .remove([parsed.data.storagePath]);
    if (cleanupError) {
      console.error(
        "[media.attach] ORPHANED OBJECT, remove manually:",
        parsed.data.storagePath,
        cleanupError.message,
      );
    }

    if (error?.code === "23514") {
      return { ok: false, formError: "A post can carry at most 4 images." };
    }
    return { ok: false, formError: "That image could not be attached." };
  }

  revalidatePath("/feed");
  revalidatePath(`/posts/${parsed.data.postId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}

/** Remove an image from a post, bytes and row together. */
export async function detachMediaAction(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  await requireUser("/feed");

  const parsed = detachMediaSchema.safeParse({
    mediaId: formData.get("mediaId"),
    postId: formData.get("postId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That image could not be found." };
  }

  const supabase = await createClient();

  // Read the path first: after the row is gone there is nothing to tell us
  // which object to remove. RLS means this returns nothing unless the caller
  // is the post's author.
  const { data: row, error: readError } = await supabase
    .from("post_media")
    .select("storage_path")
    .eq("id", parsed.data.mediaId)
    .maybeSingle();

  if (readError) {
    console.error("[media.detach] read failed", readError.message);
    return { ok: false, formError: "That image could not be removed." };
  }
  if (!row) {
    return { ok: false, formError: "That image is no longer there." };
  }

  const { data: deleted, error } = await supabase
    .from("post_media")
    .delete()
    .eq("id", parsed.data.mediaId)
    .select("id");

  if (error || !deleted || deleted.length === 0) {
    console.error("[media.detach] delete failed", error?.message);
    return { ok: false, formError: "That image could not be removed." };
  }

  const { error: storageError } = await supabase.storage
    .from("post-media")
    .remove([row.storage_path]);
  if (storageError) {
    // The row is gone, so the image has left the platform. The bytes remain,
    // which costs storage but exposes nothing: no row, no signed URL.
    console.error(
      "[media.detach] ORPHANED OBJECT, remove manually:",
      row.storage_path,
      storageError.message,
    );
  }

  revalidatePath("/feed");
  revalidatePath(`/posts/${parsed.data.postId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}

/** Add or correct an image's alternative text. */
export async function updateAltTextAction(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  await requireUser("/feed");

  const parsed = updateAltTextSchema.safeParse({
    mediaId: formData.get("mediaId"),
    postId: formData.get("postId"),
    altText: formData.get("altText") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_media")
    .update({ alt_text: parsed.data.altText })
    .eq("id", parsed.data.mediaId)
    .select("id");

  if (error) {
    console.error("[media.altText] failed", error.message);
    return { ok: false, formError: "That description could not be saved." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That image is no longer there." };
  }

  revalidatePath("/feed");
  revalidatePath(`/posts/${parsed.data.postId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}
