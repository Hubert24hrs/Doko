"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import { attachMediaSchema, detachMediaSchema } from "./media";

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
 * Record a photo the client has already uploaded to storage.
 *
 * Mirrors features/posts/media-actions.ts: the upload itself goes straight
 * from the browser to the bucket, which is where it is actually authorised;
 * this only records what landed, and removes the object again if the row
 * insert fails so nothing is paid for and nothing nobody can see is kept.
 */
export async function attachMediaAction(input: {
  listingId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
}): Promise<MediaActionState> {
  const user = await requireUser("/marketplace");

  const parsed = attachMediaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `listing-media:${user.id}`,
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
    .from("listing_media")
    .insert({
      listing_id: parsed.data.listingId,
      storage_path: parsed.data.storagePath,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.byteSize,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      alt_text: parsed.data.altText ?? null,
    })
    .select("id");

  if (error || !data || data.length === 0) {
    console.error("[marketplace.media.attach] insert failed", error?.message);

    const { error: cleanupError } = await supabase.storage
      .from("listing-media")
      .remove([parsed.data.storagePath]);
    if (cleanupError) {
      console.error(
        "[marketplace.media.attach] ORPHANED OBJECT, remove manually:",
        parsed.data.storagePath,
        cleanupError.message,
      );
    }

    if (error?.code === "23514") {
      return { ok: false, formError: "A listing can carry at most 6 photos." };
    }
    return { ok: false, formError: "That photo could not be attached." };
  }

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${parsed.data.listingId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}

/** Remove a photo from a listing, bytes and row together. */
export async function detachMediaAction(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  await requireUser("/marketplace");

  const parsed = detachMediaSchema.safeParse({
    mediaId: formData.get("mediaId"),
    listingId: formData.get("listingId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That photo could not be found." };
  }

  const supabase = await createClient();

  const { data: row, error: readError } = await supabase
    .from("listing_media")
    .select("storage_path")
    .eq("id", parsed.data.mediaId)
    .maybeSingle();

  if (readError) {
    console.error("[marketplace.media.detach] read failed", readError.message);
    return { ok: false, formError: "That photo could not be removed." };
  }
  if (!row) {
    return { ok: false, formError: "That photo is no longer there." };
  }

  const { data: deleted, error } = await supabase
    .from("listing_media")
    .delete()
    .eq("id", parsed.data.mediaId)
    .select("id");

  if (error || !deleted || deleted.length === 0) {
    console.error("[marketplace.media.detach] delete failed", error?.message);
    return { ok: false, formError: "That photo could not be removed." };
  }

  const { error: storageError } = await supabase.storage
    .from("listing-media")
    .remove([row.storage_path]);
  if (storageError) {
    console.error(
      "[marketplace.media.detach] ORPHANED OBJECT, remove manually:",
      row.storage_path,
      storageError.message,
    );
  }

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${parsed.data.listingId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}
