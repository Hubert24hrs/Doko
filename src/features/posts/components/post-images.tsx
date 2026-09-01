import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { PostImage } from "../media-queries";

/**
 * Images attached to a post.
 *
 * Plain <img>, not next/image. next/image would proxy every file through the
 * optimiser, and these are private objects behind expiring signed URLs — the
 * optimiser would cache them under a key that outlives the signature and serve
 * a stale or broken image to the next viewer.
 *
 * SPACE IS RESERVED BEFORE THE IMAGE ARRIVES, and it has to be, for two
 * reasons. The obvious one is that text must not jump once the photograph
 * loads, which on a slow connection is the difference between readable and
 * infuriating. The less obvious one bit during development: an <img> sized
 * only by `w-auto` has no dimensions until it loads, so its container
 * collapses to nothing — and `loading="lazy"` then never fires, because a
 * zero-height element never enters the viewport. The image could not load
 * because it had no size, and had no size because it had not loaded.
 *
 * The container therefore carries the aspect ratio recorded at upload, which
 * CSS can honour before a single byte arrives.
 */
export function PostImages({
  images,
  className,
}: {
  images: PostImage[];
  className?: string;
}) {
  if (images.length === 0) return null;

  const single = images.length === 1;

  return (
    <ul
      className={cn(
        "mt-3 grid gap-2",
        single ? "grid-cols-1" : "grid-cols-2",
        className,
      )}
    >
      {images.map((image) => {
        // Known dimensions let a lone image keep its own shape instead of
        // being letterboxed inside a wide box, which reads as an empty frame
        // rather than a photograph.
        const ratio =
          single && image.width && image.height
            ? image.width / image.height
            : undefined;

        return (
          <li
            key={image.id}
            className={cn(
              "overflow-hidden rounded-lg border border-border bg-surface-sunken",
              single ? "mx-auto w-full" : "aspect-square",
            )}
            style={
              ratio
                ? {
                    aspectRatio: String(ratio),
                    // A DEFINITE width, computed from the ratio, not one
                    // inferred from the contents. `fit-content` around an
                    // image that has not loaded is still zero, which is what
                    // collapsed the box and stopped it ever loading.
                    // min() keeps a landscape photo inside the column while a
                    // portrait one shrinks until it is 32rem tall.
                    width: `min(100%, ${(32 * ratio).toFixed(3)}rem)`,
                  }
                : undefined
            }
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
                  "h-full w-full",
                  // With the container already carrying the right ratio,
                  // `cover` fills it exactly and crops nothing.
                  ratio ? "object-cover" : "h-auto max-h-[32rem] object-contain",
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
        );
      })}
    </ul>
  );
}
