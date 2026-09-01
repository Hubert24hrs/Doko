import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FeedPost } from "@/features/posts/queries";

/**
 * Posts inside a group, newest first.
 *
 * No visibility filtering: posts_select_group already answers "may this caller
 * read posts in this group" by asking can_see_group, so a private group's
 * posts simply do not come back for a non-member.
 */
export async function getGroupPosts(groupId: string): Promise<FeedPost[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("posts")
      .select(
        `id, author_id, body, geo_id, visibility, created_at, updated_at,
         edited_at, deleted_at, comment_count, reaction_count, group_id,
         author:author_id ( username, full_name, avatar_path, is_verified ),
         community:geo_id ( name, slug )`,
      )
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[groups.getPosts] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as FeedPost[];
  } catch (cause) {
    console.error("[groups.getPosts] unavailable", cause);
    return [];
  }
}

/**
 * Is there an owner other than this member?
 *
 * Used to decide whether to offer "Leave group" at all. The database refuses
 * to let the last owner leave regardless — the guard trigger raises — but a
 * member should learn that from a disabled control rather than by pressing a
 * button and being told no.
 */
export async function groupHasOtherOwner(
  groupId: string,
  userId: string,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("role", "owner")
      .neq("user_id", userId);

    if (error) {
      console.error("[groups.hasOtherOwner] failed", error.message);
      // Assume there IS another owner on failure, so a transient error does
      // not permanently disable a legitimate Leave button.
      return true;
    }
    return (count ?? 0) > 0;
  } catch (cause) {
    console.error("[groups.hasOtherOwner] unavailable", cause);
    return true;
  }
}
