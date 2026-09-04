import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser, isStaff } from "@/features/auth/session";
import { signOutAction } from "@/features/auth/actions";
import { getVillageOptions } from "@/features/geo/queries";
import { getFeedPage } from "@/features/posts/queries";
import { getPostImages } from "@/features/posts/media-queries";
import { getFollowedIds } from "@/features/follows/queries";
import { PostComposer, VisibilityHint } from "@/features/posts/components/post-composer";
import { PostCard } from "@/features/posts/components/post-card";
import { MessagesNavLink } from "@/features/messages/components/messages-nav-link";
import { NotificationsNavLink } from "@/features/notifications/components/notifications-nav-link";

export const metadata: Metadata = {
  title: "Feed",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; view?: string }>;
}) {
  const user = await requireUser("/feed");
  const { before, view } = await searchParams;

  const followingOnly = view === "following";

  // Only fetched when needed. An empty result is passed through as an empty
  // array rather than undefined, so getFeedPage shows an empty feed instead of
  // silently falling back to everything.
  const followedIds = followingOnly ? await getFollowedIds() : undefined;

  const [villages, page] = await Promise.all([
    getVillageOptions(),
    getFeedPage(before, followedIds),
  ]);

  const staff = isStaff(user);

  // One query and one batch signing for the whole page, rather than per post.
  const imagesByPost = await getPostImages(page.posts.map((p) => p.id));

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <MessagesNavLink />
            <Link
              href="/events"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Events
            </Link>
            <Link
              href="/jobs"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Jobs
            </Link>
            <Link
              href="/marketplace"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Marketplace
            </Link>
            <Link
              href="/groups"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Groups
            </Link>
            <Link
              href="/issues"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Issues
            </Link>
            <Link
              href="/communities"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Communities
            </Link>
            <Link
              href="/settings"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Settings
            </Link>
            {staff ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Admin
              </Link>
            ) : null}
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="sr-only">Community feed</h1>

        <div className="space-y-2">
          <PostComposer
            villages={villages}
            defaultGeoId={user.profile?.village_id}
          />
          <VisibilityHint />
        </div>

        <nav aria-label="Feed view" className="mt-8 flex gap-1 border-b border-border">
          <Link
            href="/feed"
            aria-current={followingOnly ? undefined : "page"}
            className={
              followingOnly
                ? "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                : "border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
            }
          >
            Everyone
          </Link>
          <Link
            href="/feed?view=following"
            aria-current={followingOnly ? "page" : undefined}
            className={
              followingOnly
                ? "border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            Following
          </Link>
        </nav>

        <section aria-label="Posts" className="mt-4 space-y-4">
          {!page.available ? (
            <ErrorState
              title="The feed could not be loaded"
              description="This is usually a temporary connection problem. Please try again shortly."
            />
          ) : page.posts.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText className="size-6" />}
              title={
                followingOnly
                  ? "Nothing from the people you follow"
                  : "Nothing here yet"
              }
              description={
                followingOnly
                  ? "Follow neighbours from their profile and their posts will appear here."
                  : "Be the first to share something with Igbo-Eze North."
              }
            />
          ) : (
            page.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                canManage={post.author_id === user.id || staff}
                canEdit={post.author_id === user.id}
                images={imagesByPost.get(post.id) ?? []}
                showConversationLink
              />
            ))
          )}
        </section>

        {page.nextCursor ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`/feed?${followingOnly ? "view=following&" : ""}before=${encodeURIComponent(page.nextCursor)}`}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
            >
              Show older posts
            </Link>
          </div>
        ) : null}

        {before ? (
          <div className="mt-4 flex justify-center">
            <Link
              href={followingOnly ? "/feed?view=following" : "/feed"}
              className="text-sm font-medium text-primary hover:underline"
            >
              Back to the newest posts
            </Link>
          </div>
        ) : null}
      </main>
    </>
  );
}
