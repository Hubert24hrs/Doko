"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { RealtimeIndicator, playNotificationChime } from "@/components/ui/realtime-indicator";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils/cn";

import { MESSAGE_MAX_LENGTH } from "../schemas";
import {
  markConversationReadAction,
  sendMessageAction,
  withdrawMessageAction,
  type MessageState,
} from "../actions";
import type { ThreadMessage } from "../queries";
import { typingLabel, usePresence } from "../use-presence";

const INITIAL: MessageState = { ok: false };

function dayLabel(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(then, today)) return "Today";
  if (sameDay(then, yesterday)) return "Yesterday";
  return then.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: then.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function clockTime(iso: string): string {
  // hour12 stated, matching the events surface: the app should not speak
  // 24-hour time in one place and 12-hour in another.
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function WithdrawButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded px-1 text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
    >
      <Trash2 className="mr-0.5 inline size-3" aria-hidden="true" />
      {pending ? "Withdrawing…" : "Withdraw"}
    </button>
  );
}

/**
 * One conversation, with live delivery.
 *
 * A realtime event is treated as a SIGNAL, never as data. The payload is
 * discarded and the server component is re-run, so what finally renders has
 * passed through RLS on the server exactly as a fresh page load would. That
 * costs a round trip per incoming message and buys the guarantee that no
 * broadcast payload can ever put on screen something the reader was not
 * entitled to see.
 */
export function MessageThread({
  conversationId,
  messages,
  viewerId,
  viewerName,
  olderCursor,
  available,
  isGroup = false,
}: {
  conversationId: string;
  messages: ThreadMessage[];
  viewerId: string;
  /** Shown to the other side as "<name> is typing". */
  viewerName: string;
  olderCursor: string | null;
  available: boolean;
  /**
   * A group conversation names its speakers. In a pair there are only two
   * people and a name above every bubble is noise; in a group, a message
   * without one is unreadable.
   */
  isGroup?: boolean;
}) {
  const router = useRouter();
  const [sendState, setSendState] = useState<MessageState>(INITIAL);
  const [withdrawState, withdrawAction] = useActionState(
    withdrawMessageAction,
    INITIAL,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const { others, typing, notifyTyping } = usePresence(conversationId, {
    id: viewerId,
    name: viewerName,
  });
  const nowTyping = typingLabel(typing);

  const remaining = MESSAGE_MAX_LENGTH - draft.length;
  const overLimit = remaining < 0;

  // Opening a thread is reading it. Done once per conversation rather than on
  // every re-render, which realtime causes often.
  useEffect(() => {
    void markConversationReadAction(conversationId);
  }, [conversationId]);

  /**
   * Submitted by hand rather than through a form action, so the box is cleared
   * only once the SERVER has accepted the message. Clearing on submit would
   * throw away what somebody wrote whenever a send failed.
   */
  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    const formData = new FormData(event.currentTarget);
    setSending(true);
    setSendState(INITIAL);

    try {
      const result = await sendMessageAction(INITIAL, formData);
      setSendState(result);
      if (result.ok) {
        setDraft("");
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (cause) {
      console.error("[message-thread] send failed", cause);
      setSendState({ ok: false, formError: "Your message could not be sent." });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
    // Only when the conversation changes, not on every new message: yanking
    // somebody to the bottom while they are reading history is hostile.
  }, [conversationId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          if (payload?.new?.author_id && payload.new.author_id !== viewerId && !soundMuted) {
            playNotificationChime();
          }
          router.refresh();
          void markConversationReadAction(conversationId);
        },
      )
      .subscribe((status, err) => {
        const joined = status === "SUBSCRIBED";
        setLive(joined);
        if (process.env.NODE_ENV === "development") {
          if (joined) {
            console.info("[realtime] message channel SUBSCRIBED — live delivery active", conversationId);
          } else if (status === "CHANNEL_ERROR") {
            console.warn("[realtime] message channel error", { err, conversationId });
          } else if (status === "TIMED_OUT") {
            console.warn("[realtime] message channel timed out", { conversationId });
          }
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  // Day separators are computed BEFORE rendering rather than by carrying a
  // mutable "last day seen" through the map. A variable reassigned during
  // render keeps its value into the next one, so the first message after a
  // re-render would lose its date heading.
  const dayHeadings = messages.map((message, index) => {
    const day = dayLabel(message.created_at);
    const previous =
      index === 0 ? null : dayLabel(messages[index - 1].created_at);
    return day === previous ? null : day;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto px-1 py-4">
        {!available ? (
          <ErrorState
            title="This conversation could not be loaded"
            description="This is usually a temporary connection problem. Please try again shortly."
          />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<Send className="size-6" />}
            title="No messages yet"
            description={
              isGroup
                ? "Say hello. Only members of this group can read this."
                : "Say hello. Only the two of you can read this."
            }
          />
        ) : (
          <>
            {olderCursor ? (
              <div className="flex justify-center pb-2">
                <Link
                  href={`/messages/${conversationId}?before=${encodeURIComponent(olderCursor)}`}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-sunken"
                >
                  Show earlier messages
                </Link>
              </div>
            ) : null}

            {messages.map((message, index) => {
              const mine = message.author_id === viewerId;
              const withdrawn = message.deleted_at !== null;
              const heading = dayHeadings[index];

              return (
                <div key={message.id}>
                  {heading ? (
                    <div className="py-3 text-center">
                      <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-muted-foreground">
                        {heading}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "group flex flex-col",
                      mine ? "items-end" : "items-start",
                    )}
                  >
                    {isGroup && !mine ? (
                      <span className="px-1 pb-0.5 text-xs font-medium text-muted-foreground">
                        {message.author?.full_name ?? "Unknown member"}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2 text-sm sm:max-w-[75%]",
                        withdrawn
                          ? "border border-dashed border-border-strong text-muted-foreground italic"
                          : mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-sunken text-foreground",
                      )}
                    >
                      {withdrawn ? (
                        <span>
                          {mine
                            ? "You withdrew this message"
                            : "This message was withdrawn"}
                        </span>
                      ) : (
                        <span className="whitespace-pre-wrap break-words">
                          {message.body}
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2 px-1">
                      <time
                        dateTime={message.created_at}
                        className="text-[0.6875rem] text-muted-foreground"
                      >
                        {clockTime(message.created_at)}
                        {message.edited_at && !withdrawn ? " · edited" : ""}
                      </time>

                      {mine && !withdrawn ? (
                        <form
                          action={withdrawAction}
                          className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
                        >
                          <input
                            type="hidden"
                            name="messageId"
                            value={message.id}
                          />
                          <input
                            type="hidden"
                            name="conversationId"
                            value={conversationId}
                          />
                          <WithdrawButton />
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {withdrawState.formError ? (
        <p role="alert" className="px-1 pb-2 text-xs text-danger">
          {withdrawState.formError}
        </p>
      ) : null}

      <div
        aria-live="polite"
        className="min-h-5 px-1 text-xs text-muted-foreground"
      >
        {/* Its own row with a reserved height: without one the composer would
            jump every time somebody started or stopped typing. */}
        {nowTyping
          ? nowTyping
          : others.length === 0
            ? null
            : isGroup
              ? `${others.length} other ${
                  others.length === 1 ? "member is" : "members are"
                } here now`
              : `${others[0].name} is here now`}
      </div>

      <div className="border-t border-border pt-3">
        <form onSubmit={handleSend} className="space-y-2" noValidate>
          <input type="hidden" name="conversationId" value={conversationId} />

          {sendState.formError ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {sendState.formError}
            </p>
          ) : null}

          <Field error={sendState.fieldErrors?.body}>
            <FieldLabel className="sr-only">Write a message</FieldLabel>
            <FieldTextarea
              name="body"
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH + 100}
              placeholder="Write a message…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                notifyTyping();
              }}
            />
          </Field>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RealtimeIndicator isLive={live} />
              <button
                type="button"
                onClick={() => setSoundMuted((prev) => !prev)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface-sunken hover:text-foreground transition-colors"
                title={soundMuted ? "Unmute message chime" : "Mute message chime"}
              >
                {soundMuted ? (
                  <VolumeX className="size-3.5 text-muted-foreground" />
                ) : (
                  <Volume2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <span className="sr-only">{soundMuted ? "Unmute audio chime" : "Mute audio chime"}</span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              {draft.length > MESSAGE_MAX_LENGTH - 400 ? (
                <span
                  aria-live="polite"
                  className={
                    overLimit
                      ? "text-xs font-medium tabular-nums text-danger"
                      : "text-xs tabular-nums text-muted-foreground"
                  }
                >
                  {remaining.toLocaleString("en-NG")}
                </span>
              ) : null}
              <Button
                type="submit"
                size="sm"
                isLoading={sending}
                loadingLabel="Sending"
                disabled={draft.trim().length === 0 || overLimit}
              >
                {sending ? null : <Send aria-hidden="true" />}
                Send
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

