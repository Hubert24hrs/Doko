"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { RealtimeIndicator, playNotificationChime } from "@/components/ui/realtime-indicator";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Keeps /messages current without a refresh.
 *
 * Observed on the live walkthrough: a new conversation appeared in the inbox
 * only after a reload. The open THREAD was live; the inbox had no subscription
 * at all, so somebody sitting on their inbox waiting for a reply saw nothing.
 *
 * Same rule as the thread -- a realtime event is a SIGNAL, not data. The
 * payload is ignored and the server component re-runs, so what renders has
 * passed through RLS on the server exactly as a fresh page load would, and the
 * unread counts, previews and ordering all come from the one inbox RPC rather
 * than being patched together in the browser.
 *
 * No migration was needed. `messages` has been in the `supabase_realtime`
 * publication since migration 015, and Supabase evaluates the table's RLS for
 * every subscriber on every change -- so this unfiltered subscription delivers
 * only messages in conversations the reader is actually in, including group
 * chats they belong to and never ones they have left.
 */
export function InboxLive({ viewerId }: { viewerId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();

    // Several messages can land within a second -- a burst in a group chat, or
    // one member firing off three short lines. Coalesce them into a single
    // refresh rather than re-running the inbox query once per message.
    const refreshSoon = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        router.refresh();
      }, 400);
    };

    const channel = supabase
      .channel(`inbox:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: { new?: { author_id?: string } }) => {
          // Somebody else's message is news; your own, sent from another tab,
          // only needs the list re-sorted.
          if (payload?.new?.author_id && payload.new.author_id !== viewerId) {
            playNotificationChime();
          }
          refreshSoon();
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [viewerId, router]);

  return <RealtimeIndicator isLive={live} />;
}
