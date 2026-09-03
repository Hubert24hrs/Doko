"use client";

import { ImageOff, Images } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { IssueImage } from "../media-queries";

/**
 * An issue's photographs, on its detail page.
 *
 * Plain <img> rather than next/image because these sit behind expiring
 * signed URLs. Fixed aspect ratios allow the browser to reserve the box
 * before bytes arrive to prevent layout shift.
 */
export function IssueGallery({ images }: { images: IssueImage[] }) {
  if (images.length === 0) {
    return null;
  }

  const [first, ...rest] = images;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border bg-surface-sunken">
        <IssuePhoto image={first} className="aspect-[4/3] w-full" priority />
      </div>

      {rest.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-4">
          {rest.map((image) => (
            <li
              key={image.id}
              className="overflow-hidden rounded-lg border border-border bg-surface-sunken"
            >
              <IssuePhoto image={image} className="aspect-square w-full" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function IssuePhoto({
  image,
  className,
  priority = false,
}: {
  image: IssueImage;
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
        <ImageOff className="size-6" aria-hidden="true" />
        <span className="text-xs">Photo unavailable</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt={image.altText ?? "Community issue photo"}
      loading={priority ? "eager" : "lazy"}
      className={cn("object-cover", className)}
    />
  );
}
