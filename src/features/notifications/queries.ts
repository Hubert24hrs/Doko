import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/database";

export interface NotificationItem extends NotificationRow {
  actor?: {
    username: string;
    full_name: string;
    is_verified: boolean;
    avatar_path: string | null;
  } | null;
}

export const NOTIFICATIONS_PAGE_SIZE = 30;

export async function getNotifications(cursor?: string): Promise<{
  notifications: NotificationItem[];
  nextCursor: string | null;
  available: boolean;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { notifications: [], nextCursor: null, available: false };
    }

    let query = supabase
      .from("notifications")
      .select(`
        id, user_id, actor_id, type, title, body, link, read_at, created_at,
        actor:actor_id ( username, full_name, is_verified, avatar_path )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_PAGE_SIZE);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[notifications.list] failed", error.message);
      return { notifications: [], nextCursor: null, available: false };
    }

    const notifications = (data ?? []) as unknown as NotificationItem[];
    const nextCursor =
      notifications.length === NOTIFICATIONS_PAGE_SIZE
        ? notifications[notifications.length - 1].created_at
        : null;

    return { notifications, nextCursor, available: true };
  } catch (cause) {
    console.error("[notifications.list] unavailable", cause);
    return { notifications: [], nextCursor: null, available: false };
  }
}

/**
 * How many unread notifications wait for the signed-in user.
 *
 * Returns null on error (rendered as no badge rather than zero).
 */
export async function getUnreadNotificationCount(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[notifications.unread] failed", error.message);
      return null;
    }
    return count ?? 0;
  } catch (cause) {
    console.error("[notifications.unread] unavailable", cause);
    return null;
  }
}
