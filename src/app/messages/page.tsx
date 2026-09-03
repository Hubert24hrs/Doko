import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, UsersRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getInbox } from "@/features/messages/queries";
import type { ConversationSummary } from "@/features/messages/queries";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Short, absolute-when-old timestamp. An inbox is scanned, not read. */
function whenLabel(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  const now = new Date();
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();

  if (sameDay) {
    return then.toLocaleTimeString("en-NG", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return then.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const other = conversation.other;
  const unread = conversation.unreadCount > 0;
  // groupId, not the absence of `other`: a direct conversation whose
  // correspondent could not be read also has no `other`, and labelling that
  // as a group would be wrong in a way nobody would notice.
  const isGroup = conversation.groupId !== null;
  const title = isGroup
    ? conversation.groupName ?? "Group conversation"
    : other?.full_name ?? "Unknown member";

  const preview = conversation.previewWithdrawn
    ? "Message withdrawn"
    : conversation.preview
      ? `${conversation.previewIsMine ? "You: " : ""}${conversation.preview}`
      : "No messages yet";

  return (
    <Card>
      <CardContent className="p-0">
        <Link
          href={`/messages/${conversation.id}`}
          className="flex items-start justify-between gap-4 rounded-xl px-5 py-4 hover:bg-surface-sunken"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isGroup ? (
                <UsersRound
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={
                  unread
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground"
                }
              >
                {title}
              </span>
              {!isGroup && other?.is_verified ? <VerifiedBadge /> : null}
              {!isGroup && other ? (
                <span className="text-xs text-muted-foreground">
                  @{other.username}
                </span>
              ) : null}
            </div>
            <p
              className={
                unread
                  ? "mt-1 truncate text-sm font-medium text-foreground"
                  : "mt-1 truncate text-sm text-muted-foreground"
              }
            >
              {preview}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-xs text-muted-foreground">
              {whenLabel(conversation.lastMessageAt)}
            </span>
            {unread ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
                {conversation.unreadCount}
                <span className="sr-only"> unread messages</span>
              </span>
            ) : null}
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function MessagesPage() {
  await requireUser("/messages");
  const inbox = await getInbox();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/feed"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Feed
            </Link>
            <Link
              href="/groups"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Groups
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Messages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private conversations. Only the people in them can read them.
        </p>

        <section aria-label="Conversations" className="mt-6 space-y-3">
          {!inbox.available ? (
            <ErrorState
              title="Your messages could not be loaded"
              description="This is usually a temporary connection problem. Please try again shortly."
            />
          ) : inbox.conversations.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="size-6" />}
              title="No conversations yet"
              description="Open somebody's profile from the feed and press Message to start one."
            />
          ) : (
            inbox.conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} />
            ))
          )}
        </section>
      </main>
    </>
  );
}
