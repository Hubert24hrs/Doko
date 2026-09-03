import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

import {
  LISTING_CATEGORY_LABEL,
  LISTING_CONDITION_LABEL,
  LISTING_STATUS_LABEL,
  priceLabel,
} from "../schemas";
import type { ListingSummary } from "../queries";
import type { ListingImage } from "../media-queries";

export function ListingCard({
  listing,
  thumbnail,
}: {
  listing: ListingSummary;
  /** The first photo, if one has been signed. Absent rather than a broken image. */
  thumbnail?: ListingImage;
}) {
  const notAvailable = listing.status !== "available";

  return (
    <Card>
      <Link href={`/marketplace/${listing.id}`} className="flex gap-3 p-3">
        <div className="size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
          {thumbnail?.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumbnail.url}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                "aspect-square size-24 object-cover",
                notAvailable && "opacity-60",
              )}
            />
          ) : (
            <div className="flex aspect-square size-24 items-center justify-center text-muted-foreground">
              <ImageOff className="size-5" aria-hidden="true" />
            </div>
          )}
        </div>

        <CardContent className="min-w-0 flex-1 p-0">
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <span
              className={cn(
                "font-medium text-foreground",
                notAvailable && "line-through decoration-muted-foreground/60",
              )}
            >
              {listing.title}
            </span>
            {notAvailable ? (
              <Badge variant="neutral">{LISTING_STATUS_LABEL[listing.status]}</Badge>
            ) : null}
          </div>

          <p className="mt-0.5 font-semibold text-foreground">
            {priceLabel(listing.price, listing.price_is_negotiable)}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{LISTING_CATEGORY_LABEL[listing.category]}</span>
            {listing.condition ? (
              <span>{LISTING_CONDITION_LABEL[listing.condition]}</span>
            ) : null}
            {listing.location_text || listing.community ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {[listing.location_text, listing.community?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
