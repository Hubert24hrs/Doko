import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PostMediaRow } from "@/types/database";

export interface PostImage {
  id: string;
  /** Short-lived signed URL. Null when one could not be minted. */
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Signed URLs live an hour.
 *
 * Long enough that a page open in a tab keeps working, short enough that a URL
 * pasted elsewhere stops working before it travels far. The bucket is private,
 * so a signed URL is the only way to fetch the bytes, and minting one requires
 * passing the storage policies — which ask exactly who may read the post.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Images for a set of posts, keyed by post id.
 *
 * One row query plus one batch sign, rather than per-post work: a feed page of
 * twenty posts would otherwise mean twenty round trips for rows and up to
 * eighty for URLs.
 */
export async function getPostImages(
  postIds: string[],
): Promise<Map<string, PostImage[]>> {
  const byPost = new Map<string, PostImage[]>();
  if (postIds.length === 0) return byPost;

  try {
    const supabase = await createClient();

    // RLS on post_media mirrors the post's own visibility, so this returns
    // nothing for a post the caller cannot see.
    const { data, error } = await supabase
      .from("post_media")
      .select("id, post_id, storage_path, alt_text, width, height, sort_order")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[media.getPostImages] query failed", error.message);
      return byPost;
    }

    const rows = (data ?? []) as Pick<
      PostMediaRow,
      "id" | "post_id" | "storage_path" | "alt_text" | "width" | "height" | "sort_order"
    >[];
    if (rows.length === 0) return byPost;

    const { data: signed, error: signError } = await supabase.storage
      .from("post-media")
      .createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );

    if (signError) {
      console.error("[media.getPostImages] signing failed", signError.message);
    }

    const urlByPath = new Map<string, string>();
    for (const entry of signed ?? []) {
      // createSignedUrls reports per-item errors rather than failing the batch,
      // so one unreadable object does not cost the whole page its images.
      if (entry.error || !entry.signedUrl) {
        console.error("[media.getPostImages] could not sign", entry.path, entry.error);
        continue;
      }
      if (entry.path) urlByPath.set(entry.path, entry.signedUrl);
    }

    for (const row of rows) {
      const list = byPost.get(row.post_id) ?? [];
      list.push({
        id: row.id,
        url: urlByPath.get(row.storage_path) ?? null,
        altText: row.alt_text,
        width: row.width,
        height: row.height,
      });
      byPost.set(row.post_id, list);
    }

    return byPost;
  } catch (cause) {
    console.error("[media.getPostImages] unavailable", cause);
    return byPost;
  }
}
