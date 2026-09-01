import Link from "next/link";
import { Globe2, MapPin, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { FeedPost } from "../queries";

import { PostActions } from "./post-actions";

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
  className,
}: {
  post: FeedPost;
  /** True when the viewer authored it, or is staff. Controls the menu only. */
  canManage: boolean;
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
              <span className="font-medium text-foreground">
                {author?.full_name ?? "Former member"}
              </span>
              {author?.is_verified ? <VerifiedBadge /> : null}
              {author ? (
                <span className="text-sm text-muted-foreground">
                  @{author.username}
                </span>
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
                  Igbo-Eze North
                </span>
              )}

              <span aria-hidden="true">·</span>

              {post.visibility === "public" ? (
                <span className="inline-flex items-center gap-1" title="Visible to everyone">
                  <Globe2 className="size-3" aria-hidden="true" />
                  <span className="sr-only">Visible to everyone</span>
                  Public
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1"
                  title="Visible only to this community"
                >
                  <Users className="size-3" aria-hidden="true" />
                  <span className="sr-only">Visible only to this community</span>
                  Community
                </span>
              )}
            </div>
          </div>

          {canManage ? <PostActions postId={post.id} /> : null}
        </div>

        {/*
          Rendered as text, never as HTML. React escapes it, and `whitespace-
          pre-wrap` preserves the member's line breaks without needing markup,
          so there is no path from a post body to injected markup.
        */}
        <p className="mt-3 whitespace-pre-wrap break-words text-foreground">
          {post.body}
        </p>
      </CardContent>
    </Card>
  );
}
