import { ImageOff, Images } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { ListingImage } from "../media-queries";

/**
 * A listing's photos, on its own page.
 *
 * Plain <img>, not next/image, for the same reason as post images: these sit
 * behind expiring signed URLs, and the optimiser would cache one under a key
 * that outlives the signature.
 *
 * A gallery is a fixed grid -- one 4:3 main photo, square thumbnails below --
 * rather than a lone image that could be portrait or landscape. That lets a
 * plain Tailwind `aspect-[4/3]` / `aspect-square` class reserve the box, since
 * the browser can size it from the CSS alone before any bytes arrive. A
 * feed's single post photo has no such fixed shape to fall back on, which is
 * why post-images.tsx computes its own ratio from the recorded dimensions
 * instead -- see that file for what goes wrong without one.
 */
export function ListingGallery({ images }: { images: ListingImage[] }) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-sunken text-muted-foreground">
        <Images className="size-8" aria-hidden="true" />
        <span className="text-sm">No photos yet</span>
      </div>
    );
  }

  const [first, ...rest] = images;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border bg-surface-sunken">
        <ListingPhoto image={first} className="aspect-[4/3] w-full" priority />
      </div>

      {rest.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {rest.map((image) => (
            <li
              key={image.id}
              className="overflow-hidden rounded-lg border border-border bg-surface-sunken"
            >
              <ListingPhoto image={image} className="aspect-square w-full" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ListingPhoto({
  image,
  className,
  priority = false,
}: {
  image: ListingImage;
  className?: string;
  priority?: boolean;
}) {
  if (!image.url) {
    return (
      <div
        role="img"
        aria-label={image.altText ?? "Photo unavailable"}
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        <span className="text-xs">This photo could not be loaded right now.</span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={image.url}
      alt={image.altText ?? ""}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("h-full object-cover", className)}
    />
  );
}
