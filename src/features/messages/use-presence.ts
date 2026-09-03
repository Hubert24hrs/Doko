"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/** How long a "typing" signal stays true after the last keystroke that sent one. */
const TYPING_LINGER_MS = 4000;

/** At most one typing broadcast per this interval, however fast somebody types. */
const TYPING_THROTTLE_MS = 2000;

export interface PresentMember {
  userId: string;
  name: string;
}

export interface PresenceState {
  /** Everyone present except the viewer. Empty until the channel is joined. */
  others: PresentMember[];
  /** Those of them currently typing. */
  typing: PresentMember[];
  /** False when the channel is not joined, which is also the case when it refuses. */
  connected: boolean;
}

/**
 * Who else is in this conversation right now, and who is typing..."Online" is worthless a minute later, and storing
 * it would mean a write per member per heartbeat to keep a fact nobody reads
 * twice -- so it lives in Realtime, where it disappears with the connection.
 */
export function usePresence(
  conversationId: string,
  viewer: { id: string; name: string },
): PresenceState & { notifyTyping: () => void } {
  const [others, setOthers] = useState<PresentMember[]>([]);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  // Kept in refs so the effect below does not re-run -- and therefore does not
  // tear down and rebuild the channel -- every time somebody types.
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const lastSentRef = useRef(0);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const viewerRef = useRef(viewer);

  // Written in an effect, not during render. Declared BEFORE the channel
  // effect so that on mount it has already run by the time the channel reads
  // it -- effects fire in declaration order.
  useEffect(() => {
    viewerRef.current = viewer;
  }, [viewer, viewer.id, viewer.name]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    const timers = timersRef.current;

    const channel = supabase.channel(`presence:${conversationId}`, {
      // Authorised by RLS on realtime.messages against the same
      // in_conversation() that guards the messages. Without this, anybody
      // holding the conversation id could watch the room.
      config: { private: true, presence: { key: viewerRef.current.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId: string; name: string }>();
        const seen = new Map<string, PresentMember>();
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (!entry?.userId || entry.userId === viewerRef.current.id) continue;
            seen.set(entry.userId, { userId: entry.userId, name: entry.name });
          }
        }
        setOthers([...seen.values()]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const userId = (payload as { userId?: string })?.userId;
        if (!userId || userId === viewerRef.current.id) return;

        setTypingIds((current) =>
          current.includes(userId) ? current : [...current, userId],
        );

        // Typing is only ever asserted, never retracted: a client that closes
        // its laptop mid-sentence sends no "stopped". So each signal carries
        // its own expiry, and the label goes away on its own.
        const existing = timers.get(userId);
        if (existing) clearTimeout(existing);
        timers.set(
          userId,
          setTimeout(() => {
            setTypingIds((current) => current.filter((id) => id !== userId));
            timers.delete(userId);
          }, TYPING_LINGER_MS),
        );
      })
      .subscribe((status) => {
        const joined = status === "SUBSCRIBED";
        setConnected(joined);
        if (joined) {
          void channel.track({
            userId: viewerRef.current.id,
            name: viewerRef.current.name,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    // Throttled rather than debounced: somebody typing steadily should keep
    // the label alive, and a debounce would only ever fire after they stopped.
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;

    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: viewerRef.current.id },
    });
  }, []);

  const typing = others.filter((member) => typingIds.includes(member.userId));

  return { others, typing, connected, notifyTyping };
}

/** "Ada is typing", "Ada and Obi are typing", "3 people are typing". */
export function typingLabel(typing: PresentMember[]): string | null {
  if (typing.length === 0) return null;
  if (typing.length === 1) return `${typing[0].name} is typing…`;
  if (typing.length === 2) {
    return `${typing[0].name} and ${typing[1].name} are typing…`;
  }
  return `${typing.length} people are typing…`;
}

