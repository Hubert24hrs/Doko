import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ConversationSummaryRow,
  MessageRow,
} from "@/types/database";

/** The bits of a person a conversation needs in order to render. */
export interface Correspondent {
  id: string;
  username: string;
  full_name: string;
  avatar_path: string | null;
  is_verified: boolean;
}

export interface ConversationSummary {
  id: string;
  lastMessageAt: string | null;
  unreadCount: number;
  /**
   * The other person, for a direct conversation. Null for a group
   * conversation -- and null too when their profile could not be read, which
   * is why `groupId` rather than this is what distinguishes the two.
   */
  other: Correspondent | null;
  /** Set for a group conversation; this is what tells the two kinds apart. */
  groupId: string | null;
  groupName: string | null;
  preview: string | null;
  previewIsMine: boolean;
  previewWithdrawn: boolean;
}

export interface InboxResult {
  conversations: ConversationSummary[];
  /** False when the inbox could not be read at all, as opposed to being empty. */
  available: boolean;
}

export interface ThreadMessage extends MessageRow {
  author: Correspondent | null;
}

export interface ThreadPage {
  messages: ThreadMessage[];
  /** Cursor for older messages: the created_at of the oldest row returned. */
  olderCursor: string | null;
  available: boolean;
}

export const THREAD_PAGE_SIZE = 50;

const CORRESPONDENT_FIELDS = "id, username, full_name, avatar_path, is_verified";

/**
 * The signed-in member's inbox, newest conversation first.
 *
 * One RPC for the per-conversation numbers and one query for the profiles
 * behind them. Computing the unread count and the last-message preview in the
 * application would be two extra queries per conversation, and the inbox is
 * exactly the screen where an N+1 is most visible.
 */
export async function getInbox(): Promise<InboxResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("my_conversation_summaries");
    if (error) {
      console.error("[messages.inbox] failed", error.message);
      return { conversations: [], available: false };
    }

    const rows = (data ?? []) as ConversationSummaryRow[];
    if (rows.length === 0) return { conversations: [], available: true };

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const otherIds = rows
      .map((r) => r.other_user_id)
      .filter((id): id is string => Boolean(id));

    const people = new Map<string, Correspondent>();
    if (otherIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select(CORRESPONDENT_FIELDS)
        .in("id", otherIds);

      if (profileError) {
        // The conversations are still worth showing without names attached;
        // an inbox that renders nothing because one profile is unreadable is
        // worse than one that renders "Unknown member".
        console.error("[messages.inbox] profiles failed", profileError.message);
      }
      for (const p of (profiles ?? []) as unknown as Correspondent[]) {
        people.set(p.id, p);
      }
    }

    return {
      available: true,
      conversations: rows.map((row) => ({
        id: row.conversation_id,
        lastMessageAt: row.last_message_at,
        unreadCount: row.unread_count ?? 0,
        other: row.other_user_id ? people.get(row.other_user_id) ?? null : null,
        groupId: row.group_id,
        groupName: row.group_name,
        preview: row.preview,
        previewIsMine: Boolean(user && row.preview_author_id === user.id),
        previewWithdrawn: Boolean(row.preview_withdrawn),
      })),
    };
  } catch (cause) {
    console.error("[messages.inbox] unavailable", cause);
    return { conversations: [], available: false };
  }
}

export interface ConversationDetail {
  id: string;
  /** Set for a direct conversation. */
  other: Correspondent | null;
  /** Set for a group conversation. */
  group: { id: string; name: string; slug: string } | null;
}

/**
 * One conversation the caller belongs to.
 *
 * Null when it does not exist OR the caller is not in it -- indistinguishable
 * on purpose, so the page 404s rather than confirming that a conversation
 * between two other people exists.
 */
export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // conversations_select_member already restricts this to the caller's own
    // conversations, so an empty result IS the authorisation answer.
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id, group_id, dm_key, group:group_id ( id, name, slug )")
      .eq("id", conversationId)
      .maybeSingle();

    if (error) {
      console.error("[messages.getConversation] failed", error.message);
      return null;
    }
    if (!conversation) return null;

    type EmbeddedConversation = {
      id: string;
      group_id: string | null;
      dm_key: string | null;
      group: { id: string; name: string; slug: string } | null;
    };
    const row = conversation as unknown as EmbeddedConversation;

    if (row.group_id) {
      return { id: row.id, other: null, group: row.group };
    }

    const { data: others } = await supabase
      .from("conversation_members")
      .select(`user_id, profile:user_id ( ${CORRESPONDENT_FIELDS} )`)
      .eq("conversation_id", conversationId)
      .neq("user_id", user.id)
      .limit(1);

    type Embedded = { user_id: string; profile: Correspondent | null };
    const other = ((others ?? []) as unknown as Embedded[])[0]?.profile ?? null;

    return { id: row.id, other, group: null };
  } catch (cause) {
    console.error("[messages.getConversation] unavailable", cause);
    return null;
  }
}

/**
 * One page of a thread, newest first, then reversed for display.
 *
 * Keyset pagination on created_at, as the feed uses, and for the same reason:
 * a thread grows at the end while you are reading it, which is precisely when
 * OFFSET starts skipping and repeating rows.
 *
 * Withdrawn messages are returned rather than filtered out. The row keeps its
 * place and has already lost its words -- the trigger blanks the body in the
 * database, so there is nothing here to hide. A hole in a thread is more
 * confusing than a tombstone, and it makes every reply above it read wrongly.
 */
export async function getThreadPage(
  conversationId: string,
  before?: string,
): Promise<ThreadPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("messages")
      .select(
        `id, conversation_id, author_id, body, created_at, updated_at,
         edited_at, deleted_at,
         author:author_id ( ${CORRESPONDENT_FIELDS} )`,
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE_SIZE);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) {
      console.error("[messages.thread] failed", error.message);
      return { messages: [], olderCursor: null, available: false };
    }

    const rows = (data ?? []) as unknown as ThreadMessage[];
    const olderCursor =
      rows.length === THREAD_PAGE_SIZE
        ? rows[rows.length - 1].created_at
        : null;

    // Fetched newest-first so the cursor is cheap; displayed oldest-first
    // because that is how a conversation reads.
    return { messages: rows.reverse(), olderCursor, available: true };
  } catch (cause) {
    console.error("[messages.thread] unavailable", cause);
    return { messages: [], olderCursor: null, available: false };
  }
}

/**
 * The unread total for the navigation badge.
 *
 * Returns null, never 0, when the count could not be read. A failed query must
 * not render as "you have no unread messages".
 */
export async function getUnreadCount(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_unread_message_count");
    if (error) {
      console.error("[messages.unread] failed", error.message);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (cause) {
    console.error("[messages.unread] unavailable", cause);
    return null;
  }
}

/**
 * Whether the caller may open a conversation with this person.
 *
 * Asked so the profile page can show or hide the button. The database decides
 * again when the button is pressed -- this is presentation, not the boundary.
 */
export async function canMessage(targetUserId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("can_message", {
      target_user_id: targetUserId,
    });
    if (error) {
      console.error("[messages.canMessage] failed", error.message);
      return false;
    }
    return data === true;
  } catch (cause) {
    console.error("[messages.canMessage] unavailable", cause);
    return false;
  }
}
