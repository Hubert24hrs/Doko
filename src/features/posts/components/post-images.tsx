import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { PostImage } from "../media-queries";

/**
 * Images attached to a post.
 *
 * Plain <img>, not next/image. next/image would proxy every file through the
 * optimiser, and these are private objects behind expiring signed URLs — the
 * optimiser would cache them under a key that outlives the signature, and
 * serve a stale or broken image to the next viewer. The sizes are already
 * bounded by an 8 MB upload cap.
 *
 * `width`/`height` are set when known so the browser reserves the right space
 * and the text below does not jump once the image arrives. On a slow
 * connection that shift is the difference between readable and infuriating.
 */
export function PostImages({
  images,
  className,
}: {
  images: PostImage[];
  className?: string;
}) {
  if (images.length === 0) return null;

  return (
    <ul
      className={cn(
        "mt-3 grid gap-2",
        images.length === 1 ? "grid-cols-1" : "grid-cols-2",
        className,
      )}
    >
      {images.map((image) => (
        <li
          key={image.id}
          className={cn(
            "overflow-hidden rounded-lg border border-border bg-surface-sunken",
            // A lone image keeps its shape; a set is squared off so the grid
            // does not turn into a ragged staircase.
            images.length === 1 ? "" : "aspect-square",
          )}
        >
          {image.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image.url}
              alt={image.altText ?? ""}
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              loading="lazy"
              decoding="async"
              className={cn(
                "w-full",
                images.length === 1 ? "h-auto max-h-[32rem] object-contain" : "h-full object-cover",
              )}
            />
          ) : (
            <div
              role="img"
              aria-label={image.altText ?? "Image unavailable"}
              className="flex aspect-square w-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground"
            >
              <ImageOff className="size-5" aria-hidden="true" />
              <span className="text-xs">
                This image could not be loaded right now.
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
