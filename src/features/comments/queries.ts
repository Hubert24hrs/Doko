import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CommentRow, ReactionKind } from "@/types/database";
import type { FeedPost } from "@/features/posts/queries";

export interface FeedComment extends CommentRow {
  author: {
    username: string;
    full_name: string;
    avatar_path: string | null;
    is_verified: boolean;
  } | null;
}

/** One post with everything its page needs. Null when not visible or absent. */
export async function getPostById(postId: string): Promise<FeedPost | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("posts")
      .select(
        `id, author_id, body, geo_id, visibility, created_at, updated_at,
         edited_at, deleted_at, comment_count, reaction_count,
         author:author_id ( username, full_name, avatar_path, is_verified ),
         community:geo_id ( name, slug )`,
      )
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[comments.getPostById] failed", error.message);
      return null;
    }
    return (data as unknown as FeedPost) ?? null;
  } catch (cause) {
    console.error("[comments.getPostById] unavailable", cause);
    return null;
  }
}

/**
 * Comments under a post, oldest first — the order a conversation is read in,
 * and the order the partial index already stores them in.
 */
export async function getComments(postId: string): Promise<FeedComment[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("comments")
      .select(
        `id, post_id, author_id, body, created_at, updated_at, edited_at,
         deleted_at,
         author:author_id ( username, full_name, avatar_path, is_verified )`,
      )
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[comments.getComments] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as FeedComment[];
  } catch (cause) {
    console.error("[comments.getComments] unavailable", cause);
    return [];
  }
}

/**
 * The caller's own reactions across a set of posts, as a lookup.
 *
 * One query for the whole feed page rather than one per post: the feed needs
 * to know which button to show as pressed, and asking twenty times would undo
 * the point of the denormalised counts.
 */
export async function getViewerReactions(
  postIds: string[],
): Promise<Map<string, ReactionKind>> {
  const reactions = new Map<string, ReactionKind>();
  if (postIds.length === 0) return reactions;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return reactions;

    const { data, error } = await supabase
      .from("reactions")
      .select("post_id, kind")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    if (error) {
      console.error("[comments.getViewerReactions] failed", error.message);
      return reactions;
    }

    for (const row of data ?? []) reactions.set(row.post_id, row.kind);
    return reactions;
  } catch (cause) {
    console.error("[comments.getViewerReactions] unavailable", cause);
    return reactions;
  }
}
