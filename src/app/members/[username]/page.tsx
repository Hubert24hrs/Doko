import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Globe,
  MapPin,
  MessageSquareText,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { getSessionUser, isStaff } from "@/features/auth/session";
import { getProfileByUsername } from "@/features/profile/queries";
import { getPostsByAuthor } from "@/features/posts/queries";
import { getPostImages } from "@/features/posts/media-queries";
import { PostCard } from "@/features/posts/components/post-card";
import { SocialLinks } from "@/features/profile/components/social-links";
import { FollowButton } from "@/features/follows/components/follow-button";
import { viewerFollows } from "@/features/follows/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);

  if (!profile) {
    return { title: "Member", robots: { index: false, follow: false } };
  }

  // Only a genuinely public profile is worth indexing. A community-only one
  // must not have its owner's name and bio pulled into a search result.
  if (profile.visibility !== "public") {
    return {
      title: profile.full_name,
      robots: { index: false, follow: false },
    };
  }

  const where = profile.villageName ?? profile.townName ?? "Igbo-Eze North";

  return {
    title: profile.full_name,
    description:
      profile.bio?.slice(0, 160) ??
      `${profile.full_name} on Ezike Oba, from ${where}.`,
    alternates: { canonical: `/members/${profile.username}` },
    openGraph: {
      title: `${profile.full_name} on Ezike Oba`,
      description: profile.bio?.slice(0, 160) ?? `From ${where}.`,
      type: "profile",
    },
  };
}

export default async function MemberPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  // No requireUser: a public profile is readable by signed-out visitors, and
  // RLS decides. A profile this caller may not see returns null and 404s,
  // which does not confirm that the username exists.
  const [profile, viewer] = await Promise.all([
    getProfileByUsername(username),
    getSessionUser(),
  ]);
  if (!profile) notFound();

  const isOwnProfile = viewer?.id === profile.id;
  const staff = viewer ? isStaff(viewer) : false;

  const [posts, following] = await Promise.all([
    getPostsByAuthor(profile.id),
    viewerFollows(profile.id),
  ]);
  const imagesByPost = await getPostImages(posts.posts.map((p) => p.id));

  const where = [profile.villageName, profile.townName]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href={viewer ? "/feed" : "/"}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {viewer ? "Back to the feed" : "Ezike Oba"}
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
                    {profile.full_name}
                  </h1>
                  {profile.is_verified ? <VerifiedBadge showLabel /> : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  @{profile.username}
                </p>
              </div>

              {isOwnProfile ? (
                <Link
                  href="/settings"
                  className="inline-flex h-9 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
                >
                  Edit profile
                </Link>
              ) : viewer ? (
                <FollowButton
                  profileId={profile.id}
                  username={profile.username}
                  following={following}
                />
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(`/members/${profile.username}`)}`}
                  className="inline-flex h-9 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
                >
                  Sign in to follow
                </Link>
              )}
            </div>

            {profile.bio ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-foreground">
                {profile.bio}
              </p>
            ) : null}

            <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Followers</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {profile.follower_count.toLocaleString("en-NG")}
                </dd>
                <span className="text-muted-foreground">
                  {profile.follower_count === 1 ? "follower" : "followers"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Following</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {profile.following_count.toLocaleString("en-NG")}
                </dd>
                <span className="text-muted-foreground">following</span>
              </div>
            </dl>

            <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {where ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Community</dt>
                  <MapPin className="size-4" aria-hidden="true" />
                  <dd>{where}</dd>
                </div>
              ) : null}

              {profile.occupation ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Occupation</dt>
                  <Briefcase className="size-4" aria-hidden="true" />
                  <dd>{profile.occupation}</dd>
                </div>
              ) : null}

              {profile.website ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Website</dt>
                  <Globe className="size-4" aria-hidden="true" />
                  <dd>
                    {/*
                      noopener/noreferrer and nofollow: the URL is member-
                      supplied. The scheme is already constrained to http(s) by
                      a CHECK constraint, so javascript: cannot even be stored.
                    */}
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      className="text-primary hover:underline"
                    >
                      {profile.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            <SocialLinks links={profile.socialLinks} className="mt-4" />

            {isOwnProfile && profile.visibility !== "public" ? (
              <p className="mt-4 text-xs text-muted-foreground">
                <Badge variant="neutral">
                  {profile.visibility === "private"
                    ? "Only you can see this profile"
                    : "Only your community can see this profile"}
                </Badge>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section aria-labelledby="posts-heading" className="mt-8">
          <h2
            id="posts-heading"
            className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Posts
          </h2>

          {posts.posts.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText className="size-6" />}
              title={
                isOwnProfile
                  ? "You have not posted yet"
                  : `${profile.full_name} has not posted yet`
              }
              description={
                isOwnProfile
                  ? "Share something with your community from the feed."
                  : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              {posts.posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  canManage={isOwnProfile || staff}
                  canEdit={isOwnProfile}
                  images={imagesByPost.get(post.id) ?? []}
                  showConversationLink
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
