import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { getSessionUser, isStaff } from "@/features/auth/session";
import { PostCard } from "@/features/posts/components/post-card";
import {
  getComments,
  getPostById,
  getViewerReactions,
} from "@/features/comments/queries";
import {
  CommentComposer,
  CommentList,
} from "@/features/comments/components/comment-thread";
import { ReactionBar } from "@/features/comments/components/reaction-bar";

export const dynamic = "force-dynamic";

/**
 * Metadata is generated from the post itself, but ONLY for public posts.
 * A community-scoped post must not have its text leak into a title, an
 * Open Graph description, or a search engine's index.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostById(id);

  if (!post) return { title: "Post", robots: { index: false, follow: false } };

  if (post.visibility !== "public") {
    return { title: "Post", robots: { index: false, follow: false } };
  }

  const excerpt =
    post.body.length > 160 ? `${post.body.slice(0, 157)}…` : post.body;
  const author = post.author?.full_name ?? "A member";

  return {
    title: `${author} on Ezike Oba`,
    description: excerpt,
    openGraph: {
      title: `${author} on Ezike Oba`,
      description: excerpt,
      type: "article",
      publishedTime: post.created_at,
    },
    alternates: { canonical: `/posts/${post.id}` },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // No requireUser: a public post is readable by signed-out visitors, and RLS
  // is what decides. If the post is not visible to this caller, the query
  // simply returns nothing and they get a 404 -- which is also the right
  // answer for a community post they are not entitled to see, since it does
  // not reveal that the post exists.
  const [post, user] = await Promise.all([getPostById(id), getSessionUser()]);
  if (!post) notFound();

  const [comments, reactions] = await Promise.all([
    getComments(post.id),
    getViewerReactions([post.id]),
  ]);

  const staff = user ? isStaff(user) : false;
  const canManage = Boolean(user && (post.author_id === user.id || staff));

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href={user ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href={user ? "/feed" : "/"}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {user ? "Back to the feed" : "Ezike Oba"}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <PostCard post={post} canManage={canManage} />

        {user ? (
          <div className="mt-3">
            <ReactionBar
              postId={post.id}
              count={post.reaction_count}
              viewerReaction={reactions.get(post.id) ?? null}
            />
          </div>
        ) : post.reaction_count > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {post.reaction_count.toLocaleString("en-NG")} reaction
            {post.reaction_count === 1 ? "" : "s"}
          </p>
        ) : null}

        <section aria-labelledby="replies-heading" className="mt-8">
          <h2
            id="replies-heading"
            className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {post.comment_count === 0
              ? "Replies"
              : `${post.comment_count.toLocaleString("en-NG")} ${
                  post.comment_count === 1 ? "reply" : "replies"
                }`}
          </h2>

          <Card className="mt-3">
            <CardContent className="pt-5">
              {user ? (
                <CommentComposer postId={post.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link href="/login" className="font-medium text-primary hover:underline">
                    Sign in
                  </Link>{" "}
                  to join the conversation.
                </p>
              )}

              <div className="mt-2">
                <CommentList
                  comments={comments}
                  postId={post.id}
                  viewerId={user?.id ?? null}
                  viewerIsStaff={staff}
                />
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
}
