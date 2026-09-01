import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Does the signed-in caller follow this profile? False when signed out. */
export async function viewerFollows(profileId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id === profileId) return false;

    // follows_select_own guarantees the caller can always see their own rows,
    // so this works even where the target profile is not otherwise readable.
    const { data, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .eq("following_id", profileId)
      .maybeSingle();

    if (error) {
      console.error("[follows.viewerFollows] failed", error.message);
      return false;
    }
    return Boolean(data);
  } catch (cause) {
    console.error("[follows.viewerFollows] unavailable", cause);
    return false;
  }
}

/**
 * The ids the caller follows.
 *
 * Returned as a list so the feed can filter with a single `in` clause rather
 * than a join the RLS planner would have to unpick per row. Empty when signed
 * out or following nobody, which the caller must treat as "no following feed"
 * rather than "no filter" — otherwise an empty list would silently show
 * everything.
 */
export async function getFollowedIds(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    if (error) {
      console.error("[follows.getFollowedIds] failed", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.following_id);
  } catch (cause) {
    console.error("[follows.getFollowedIds] unavailable", cause);
    return [];
  }
}
