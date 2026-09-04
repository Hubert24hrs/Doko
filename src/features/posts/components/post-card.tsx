import Link from "next/link";
import { Globe2, MapPin, MessageCircle, UserCheck, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { FeedPost } from "../queries";

import { PostActions } from "./post-actions";
import { PostBody } from "./post-body";
import { PostImages } from "./post-images";
import type { PostImage } from "../media-queries";

/** Relative time, in words, without pulling in a date library for one string. */
function timeAgo(iso: string): { label: string; exact: string } {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));

  const exact = then.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (seconds < 60) return { label: "just now", exact };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { label: `${minutes}m ago`, exact };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, exact };
  const days = Math.floor(hours / 24);
  if (days < 7) return { label: `${days}d ago`, exact };

  return {
    label: then.toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
    exact,
  };
}

export function PostCard({
  post,
  canManage,
  canEdit = false,
  showConversationLink = false,
  images = [],
  className,
}: {
  post: FeedPost;
  /** Author or staff: controls removal. */
  canManage: boolean;
  /**
   * Author ONLY. Separate from canManage because the guard trigger restores
   * `body` for anyone who is not the author, so a moderator's edit would
   * silently do nothing — offering them the control would be a lie.
   */
  canEdit?: boolean;
  /** Feed cards link into the post; the post page itself does not. */
  showConversationLink?: boolean;
  images?: PostImage[];
  className?: string;
}) {
  const author = post.author;
  const { label, exact } = timeAgo(post.created_at);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {author ? (
                <Link
                  href={`/members/${author.username}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {author.full_name}
                </Link>
              ) : (
                <span className="font-medium text-foreground">Former member</span>
              )}
              {author?.is_verified ? <VerifiedBadge type={author.verification_type} /> : null}
              {author ? (
                <Link
                  href={`/members/${author.username}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  @{author.username}
                </Link>
              ) : null}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <time dateTime={post.created_at} title={exact}>
                {label}
              </time>

              {post.edited_at ? (
                <span title={`Edited ${new Date(post.edited_at).toLocaleString("en-NG")}`}>
                  · edited
                </span>
              ) : null}

              <span aria-hidden="true">·</span>

              {post.community ? (
                <Link
                  href={`/communities#${post.community.slug}`}
                  className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                >
                  <MapPin className="size-3" aria-hidden="true" />
                  {post.community.name}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden="true" />
                  Igbo Eze North
                </span>
              )}

              <span aria-hidden="true">·</span>

              {/*
                A lookup rather than a chain of ternaries. When `followers` was
                added, a two-way if/else would have silently labelled it
                "Community" -- the wrong answer, and the kind that looks right.
              */}
              {(() => {
                const V = {
                  public: {
                    Icon: Globe2,
                    label: "Public",
                    description: "Visible to everyone",
                  },
                  community: {
                    Icon: Users,
                    label: "Community",
                    description: "Visible only to this community",
                  },
                  followers: {
                    Icon: UserCheck,
                    label: "Followers",
                    description: "Visible only to people who follow the author",
                  },
                }[post.visibility];

                return (
                  <span
                    className="inline-flex items-center gap-1"
                    title={V.description}
                  >
                    <V.Icon className="size-3" aria-hidden="true" />
                    <span className="sr-only">{V.description}</span>
                    {V.label}
                  </span>
                );
              })()}
            </div>
          </div>

          {canManage ? <PostActions postId={post.id} /> : null}
        </div>

        <PostBody postId={post.id} body={post.body} canEdit={canEdit} />

        <PostImages images={images} />

        {showConversationLink ? (
          <Link
            href={`/posts/${post.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {post.comment_count === 0
              ? "Reply"
              : `${post.comment_count.toLocaleString("en-NG")} ${
                  post.comment_count === 1 ? "reply" : "replies"
                }`}
            {post.reaction_count > 0 ? (
              <span className="text-muted-foreground">
                · {post.reaction_count.toLocaleString("en-NG")} reaction
                {post.reaction_count === 1 ? "" : "s"}
              </span>
            ) : null}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
