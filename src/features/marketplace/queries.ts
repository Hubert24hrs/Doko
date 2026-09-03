import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ListingCategory,
  ListingContactRow,
  ListingStatus,
  MarketplaceListingRow,
} from "@/types/database";

export interface ListingSummary extends MarketplaceListingRow {
  seller: {
    username: string;
    full_name: string;
    is_verified: boolean;
  } | null;
  community: { name: string; slug: string } | null;
}

export interface ListingDetail extends ListingSummary {
  /**
   * Null for a signed-out reader, ALWAYS -- not because the query failed but
   * because listing_contacts has no anon policy. Also null when the seller
   * simply never added one, which is a valid choice here: "Message the
   * seller" works regardless.
   */
  contact: ListingContactRow | null;
}

export interface ListingPage {
  listings: ListingSummary[];
  nextCursor: string | null;
  available: boolean;
}

export const LISTINGS_PAGE_SIZE = 20;

const LISTING_FIELDS = `
  id, title, description, category, condition, price, price_is_negotiable,
  can_deliver, seller_id, geo_id, location_text, group_id, visibility, status,
  created_at, updated_at, edited_at, deleted_at,
  seller:seller_id ( username, full_name, is_verified ),
  community:geo_id ( name, slug )
`;

/**
 * Listings, newest first.
 *
 * Sold and reserved items are NOT filtered out. Unlike a filled job, an item
 * marked sold is still worth seeing -- it tells a buyer who was too slow that
 * they were close, and it is the honest record of what actually happened here
 * rather than the item vanishing the moment somebody bought it.
 */
export async function getListings(
  cursor?: string,
  options?: { category?: ListingCategory; status?: ListingStatus },
): Promise<ListingPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("marketplace_listings")
      .select(LISTING_FIELDS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(LISTINGS_PAGE_SIZE);

    if (cursor) query = query.lt("created_at", cursor);
    if (options?.category) query = query.eq("category", options.category);
    if (options?.status) query = query.eq("status", options.status);

    const { data, error } = await query;
    if (error) {
      console.error("[marketplace.listings] failed", error.message);
      return { listings: [], nextCursor: null, available: false };
    }

    const listings = (data ?? []) as unknown as ListingSummary[];
    const nextCursor =
      listings.length === LISTINGS_PAGE_SIZE
        ? listings[listings.length - 1].created_at
        : null;

    return { listings, nextCursor, available: true };
  } catch (cause) {
    console.error("[marketplace.listings] unavailable", cause);
    return { listings: [], nextCursor: null, available: false };
  }
}

/** Listings the signed-in member is selling. */
export async function getMyListings(): Promise<ListingSummary[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("marketplace_listings")
      .select(LISTING_FIELDS)
      .eq("seller_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[marketplace.mine] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as ListingSummary[];
  } catch (cause) {
    console.error("[marketplace.mine] unavailable", cause);
    return [];
  }
}

/**
 * One listing, with contact details when the caller is entitled to them.
 *
 * Null when it does not exist OR the caller may not see it -- indistinguishable
 * on purpose, so the page 404s rather than confirming that a private group's
 * listing exists.
 */
export async function getListing(listingId: string): Promise<ListingDetail | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("marketplace_listings")
      .select(LISTING_FIELDS)
      .eq("id", listingId)
      .maybeSingle();

    if (error) {
      console.error("[marketplace.get] failed", error.message);
      return null;
    }
    if (!data) return null;

    const listing = data as unknown as ListingSummary;

    const { data: contact } = await supabase
      .from("listing_contacts")
      .select("*")
      .eq("listing_id", listingId)
      .maybeSingle();

    return {
      ...listing,
      contact: (contact as ListingContactRow | null) ?? null,
    };
  } catch (cause) {
    console.error("[marketplace.get] unavailable", cause);
    return null;
  }
}
