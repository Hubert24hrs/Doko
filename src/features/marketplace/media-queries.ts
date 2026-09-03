import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ListingMediaRow } from "@/types/database";

export interface ListingImage {
  id: string;
  /** Short-lived signed URL. Null when one could not be minted. */
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

/** Same TTL as post images, for the same reason: see features/posts/media-queries.ts. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Images for a set of listings, keyed by listing id. One query, one batch sign. */
export async function getListingImages(
  listingIds: string[],
): Promise<Map<string, ListingImage[]>> {
  const byListing = new Map<string, ListingImage[]>();
  if (listingIds.length === 0) return byListing;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("listing_media")
      .select("id, listing_id, storage_path, alt_text, width, height, sort_order")
      .in("listing_id", listingIds)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[marketplace.media.get] query failed", error.message);
      return byListing;
    }

    const rows = (data ?? []) as Pick<
      ListingMediaRow,
      "id" | "listing_id" | "storage_path" | "alt_text" | "width" | "height" | "sort_order"
    >[];
    if (rows.length === 0) return byListing;

    const { data: signed, error: signError } = await supabase.storage
      .from("listing-media")
      .createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );

    if (signError) {
      console.error("[marketplace.media.get] signing failed", signError.message);
    }

    const urlByPath = new Map<string, string>();
    for (const entry of signed ?? []) {
      if (entry.error || !entry.signedUrl) {
        console.error("[marketplace.media.get] could not sign", entry.path, entry.error);
        continue;
      }
      if (entry.path) urlByPath.set(entry.path, entry.signedUrl);
    }

    for (const row of rows) {
      const list = byListing.get(row.listing_id) ?? [];
      list.push({
        id: row.id,
        url: urlByPath.get(row.storage_path) ?? null,
        altText: row.alt_text,
        width: row.width,
        height: row.height,
      });
      byListing.set(row.listing_id, list);
    }

    return byListing;
  } catch (cause) {
    console.error("[marketplace.media.get] unavailable", cause);
    return byListing;
  }
}
