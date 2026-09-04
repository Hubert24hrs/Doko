import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PostRow } from "@/types/database";

/** A post with the bits of its author and community the feed needs to render. */
export interface FeedPost extends PostRow {
  author: {
    username: string;
    full_name: string;
    avatar_path: string | null;
    is_verified: boolean;
    verification_type: "blue" | "gold" | null;
  } | null;
  community: { name: string; slug: string } | null;
}

export interface FeedPage {
  posts: FeedPost[];
  /** Cursor for the next page: the created_at of the last row returned. */
  nextCursor: string | null;
  /** False when the feed could not be read at all, as opposed to being empty. */
  available: boolean;
}

export const FEED_PAGE_SIZE = 20;

/**
 * One page of the community feed, newest first.
 *
 * Keyset pagination on created_at rather than OFFSET: offsets get slower the
 * deeper you scroll and skip or repeat rows when new posts arrive mid-scroll,
 * which on a feed is the common case rather than an edge case.
 *
 * The author and community are embedded in the same query. Fetching them
 * per-row would be an N+1, and at twenty posts a page that is twenty-one
 * round trips instead of one.
 *
 * No visibility filtering appears here on purpose. RLS decides what this
 * caller may see; duplicating that logic in SQL would create a second copy to
 * keep in sync, and the copy that drifts is always the one outside the
 * database.
 */
export async function getFeedPage(
  cursor?: string,
  /**
   * When present, restricts the feed to these authors. An EMPTY array is
   * meaningful and must not be confused with "no filter": it means the member
   * follows nobody, and the honest answer is an empty feed rather than
   * everything on the platform.
   */
  authorIds?: string[],
): Promise<FeedPage> {
  try {
    if (authorIds && authorIds.length === 0) {
      return { posts: [], nextCursor: null, available: true };
    }

    const supabase = await createClient();

    let query = supabase
      .from("posts")
      .select(
        `id, author_id, body, geo_id, visibility, created_at, updated_at,
         edited_at, deleted_at, comment_count, reaction_count,
         author:author_id ( username, full_name, avatar_path, is_verified, verification_type ),
         community:geo_id ( name, slug )`,
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(FEED_PAGE_SIZE);

    if (authorIds) query = query.in("author_id", authorIds);
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;

    if (error) {
      console.error("[posts.getFeedPage] query failed", error.message);
      return { posts: [], nextCursor: null, available: false };
    }

    const posts = (data ?? []) as unknown as FeedPost[];

    return {
      posts,
      // Only offer a cursor on a full page. A short page is the end of the
      // feed, and offering one would cost an extra query to learn nothing.
      nextCursor:
        posts.length === FEED_PAGE_SIZE
          ? posts[posts.length - 1].created_at
          : null,
      available: true,
    };
  } catch (cause) {
    console.error("[posts.getFeedPage] unavailable", cause);
    return { posts: [], nextCursor: null, available: false };
  }
}

/** Posts by one member, for their profile page. */
export async function getPostsByAuthor(
  authorId: string,
  cursor?: string,
): Promise<FeedPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("posts")
      .select(
        `id, author_id, body, geo_id, visibility, created_at, updated_at,
         edited_at, deleted_at, comment_count, reaction_count,
         author:author_id ( username, full_name, avatar_path, is_verified, verification_type ),
         community:geo_id ( name, slug )`,
      )
      .eq("author_id", authorId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(FEED_PAGE_SIZE);

    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) {
      console.error("[posts.getPostsByAuthor] query failed", error.message);
      return { posts: [], nextCursor: null, available: false };
    }

    const posts = (data ?? []) as unknown as FeedPost[];
    return {
      posts,
      nextCursor:
        posts.length === FEED_PAGE_SIZE
          ? posts[posts.length - 1].created_at
          : null,
      available: true,
    };
  } catch (cause) {
    console.error("[posts.getPostsByAuthor] unavailable", cause);
    return { posts: [], nextCursor: null, available: false };
  }
}
