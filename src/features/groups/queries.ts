import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { GroupRole, GroupRow } from "@/types/database";

export interface GroupSummary extends GroupRow {
  communityName: string | null;
}

export interface GroupDetail extends GroupSummary {
  /** The caller's role, or null when they are not a member. */
  viewerRole: GroupRole | null;
}

/**
 * Groups the caller can see.
 *
 * No visibility filter here: the groups policies already return public groups
 * to everyone and private ones only to their members, so a member sees their
 * private groups in the same list without a second query or a second copy of
 * the rule.
 */
export async function listGroups(): Promise<GroupSummary[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groups")
      .select("*, community:geo_id ( name )")
      .is("deleted_at", null)
      .order("member_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[groups.list] failed", error.message);
      return [];
    }

    type Embedded = GroupRow & { community: { name: string } | null };
    return ((data ?? []) as unknown as Embedded[]).map((g) => ({
      ...g,
      communityName: g.community?.name ?? null,
    }));
  } catch (cause) {
    console.error("[groups.list] unavailable", cause);
    return [];
  }
}

/**
 * One group by slug, with the caller's own membership role.
 *
 * Null when the group does not exist OR is private and the caller is not a
 * member — indistinguishable on purpose, so a private group's existence is
 * not revealed by probing slugs.
 */
export async function getGroupBySlug(slug: string): Promise<GroupDetail | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("groups")
      .select("*, community:geo_id ( name )")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[groups.getBySlug] failed", error.message);
      return null;
    }
    if (!data) return null;

    type Embedded = GroupRow & { community: { name: string } | null };
    const group = data as unknown as Embedded;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let viewerRole: GroupRole | null = null;
    if (user) {
      // group_members_select_own guarantees the caller can always read their
      // own membership row, so this works for private groups too.
      const { data: membership } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", group.id)
        .eq("user_id", user.id)
        .maybeSingle();
      viewerRole = membership?.role ?? null;
    }

    return {
      ...group,
      communityName: group.community?.name ?? null,
      viewerRole,
    };
  } catch (cause) {
    console.error("[groups.getBySlug] unavailable", cause);
    return null;
  }
}

/** Groups the signed-in caller belongs to, for their own navigation. */
export async function listMyGroups(): Promise<GroupSummary[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("group_members")
      .select("group:group_id ( *, community:geo_id ( name ) )")
      .eq("user_id", user.id);

    if (error) {
      console.error("[groups.listMine] failed", error.message);
      return [];
    }

    type Embedded = {
      group: (GroupRow & { community: { name: string } | null }) | null;
    };

    return ((data ?? []) as unknown as Embedded[])
      .map((row) => row.group)
      .filter((g): g is GroupRow & { community: { name: string } | null } =>
        Boolean(g && !g.deleted_at),
      )
      .map((g) => ({ ...g, communityName: g.community?.name ?? null }));
  } catch (cause) {
    console.error("[groups.listMine] unavailable", cause);
    return [];
  }
}
