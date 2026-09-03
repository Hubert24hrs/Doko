import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UsersRound } from "lucide-react";

import { VerifiedBadge } from "@/components/ui/badge";
import { requireUser } from "@/features/auth/session";
import {
  getConversation,
  getThreadPage,
} from "@/features/messages/queries";
import { MessageThread } from "@/features/messages/components/message-thread";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { id } = await params;
  const { before } = await searchParams;

  const user = await requireUser(`/messages/${id}`);

  // Null covers both "no such conversation" and "you are not in it". They are
  // indistinguishable on purpose: a 403 would confirm that a conversation
  // between two other people exists.
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const page = await getThreadPage(id, before);
  const other = conversation.other;
  const group = conversation.group;

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link
            href="/messages"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
            aria-label="Back to messages"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {group ? (
                <UsersRound
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
              <h1 className="truncate font-semibold text-foreground">
                {group
                  ? group.name
                  : other?.full_name ?? "Unknown member"}
              </h1>
              {!group && other?.is_verified ? <VerifiedBadge /> : null}
            </div>
            {group ? (
              <Link
                href={`/groups/${group.slug}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                Back to the group
              </Link>
            ) : other ? (
              <Link
                href={`/members/${other.username}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                @{other.username}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-6"
      >
        <MessageThread
          conversationId={id}
          messages={page.messages}
          viewerId={user.id}
          viewerName={user.profile?.full_name ?? "A member"}
          olderCursor={page.olderCursor}
          available={page.available}
          isGroup={group !== null}
        />
      </main>
    </>
  );
}
