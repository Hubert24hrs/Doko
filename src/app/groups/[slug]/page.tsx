import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, MapPin, MessageSquareText, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser, isStaff } from "@/features/auth/session";
import { getGroupBySlug } from "@/features/groups/queries";
import { GROUP_KIND_LABEL } from "@/features/groups/schemas";
import { MembershipButton } from "@/features/groups/components/membership-button";
import { GroupComposer } from "@/features/groups/components/group-composer";
import { getGroupPosts, groupHasOtherOwner } from "@/features/groups/post-queries";
import { getPostImages } from "@/features/posts/media-queries";
import { PostCard } from "@/features/posts/components/post-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);

  // Groups sit behind sign-in, so none of this is indexable regardless. The
  // title still matters for the browser tab and for anyone sharing a link
  // with a colleague.
  return {
    title: group?.name ?? "Group",
    robots: { index: false, follow: false },
  };
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/groups/${slug}`);

  // Null covers both "no such group" and "private, and you are not in it".
  // Indistinguishable on purpose: a 404 does not confirm a private group
  // exists to somebody guessing slugs.
  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  const isMember = group.viewerRole !== null;

  const [posts, hasOtherOwner] = await Promise.all([
    getGroupPosts(group.id),
    group.viewerRole === "owner"
      ? groupHasOtherOwner(group.id, user.id)
      : Promise.resolve(true),
  ]);
  const imagesByPost = await getPostImages(posts.map((p) => p.id));
  const staff = isStaff(user);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/groups"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All groups
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {group.name}
                  </h1>
                  <Badge variant="neutral">{GROUP_KIND_LABEL[group.kind]}</Badge>
                  {group.visibility === "private" ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      title="Only members can see this group and its posts"
                    >
                      <Lock className="size-3" aria-hidden="true" />
                      Private
                    </span>
                  ) : null}
                  {group.viewerRole && group.viewerRole !== "member" ? (
                    <Badge variant="primary">
                      {group.viewerRole === "owner" ? "Owner" : "Moderator"}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden="true" />
                    {group.member_count.toLocaleString("en-NG")}{" "}
                    {group.member_count === 1 ? "member" : "members"}
                  </span>
                  {group.communityName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden="true" />
                      {group.communityName}
                    </span>
                  ) : null}
                </div>
              </div>

              <MembershipButton
                groupId={group.id}
                slug={group.slug}
                role={group.viewerRole}
                isSoleOwner={group.viewerRole === "owner" && !hasOtherOwner}
              />
            </div>

            {group.description ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-foreground">
                {group.description}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {isMember ? (
          <div className="mt-6">
            <GroupComposer groupId={group.id} slug={group.slug} />
          </div>
        ) : (
          <Card className="mt-6 border-dashed">
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">
                Join this group to post in it. Reading a group does not let you
                write in it.
              </p>
            </CardContent>
          </Card>
        )}

        <section aria-label="Group posts" className="mt-6 space-y-4">
          {posts.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText className="size-6" />}
              title="Nothing posted here yet"
              description={
                isMember
                  ? "Be the first to say something."
                  : "Join the group to start the conversation."
              }
            />
          ) : (
            posts.map((post) => (
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
      </main>
    </>
  );
}
