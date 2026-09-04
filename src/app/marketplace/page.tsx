import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getListings, getMyListings } from "@/features/marketplace/queries";
import { getListingImages } from "@/features/marketplace/media-queries";
import { ListingCard } from "@/features/marketplace/components/listing-card";
import {
  LISTING_CATEGORY_LABEL,
  listingCategories,
} from "@/features/marketplace/schemas";
import { getActiveSponsoredAds } from "@/features/ads/queries";
import { MarketplaceBannerAd } from "@/features/ads/components/marketplace-banner-ad";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Buy and sell between neighbours across Igbo Eze North: household goods, tools, produce and more.",
  alternates: { canonical: "/marketplace" },
};

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; category?: string }>;
}) {
  const { before, category } = await searchParams;
  const viewer = await getSessionUser();

  const validCategory = listingCategories.find((c) => c === category);

  const [page, mine, bannerAds] = await Promise.all([
    getListings(before, { category: validCategory }),
    viewer ? getMyListings() : Promise.resolve([]),
    getActiveSponsoredAds("marketplace_banner", 1),
  ]);

  const allIds = [...mine.map((l) => l.id), ...page.listings.map((l) => l.id)];
  const images = await getListingImages(allIds);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {viewer ? (
              <>
                <Link
                  href="/jobs"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
                >
                  Jobs
                </Link>
                <Link
                  href="/marketplace/new"
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Sell something
                </Link>
              </>
            ) : (
              <Link
                href="/login?next=%2Fmarketplace"
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Marketplace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Buying and selling between neighbours across Igbo Eze North.
        </p>

        {bannerAds.length > 0 && (
          <div className="mt-6">
            <MarketplaceBannerAd ad={bannerAds[0]} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-1.5">
          <Link
            href="/marketplace"
            className={
              validCategory
                ? "rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-sunken"
                : "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            }
          >
            All
          </Link>
          {listingCategories.map((c) => (
            <Link
              key={c}
              href={`/marketplace?category=${c}`}
              className={
                validCategory === c
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-sunken"
              }
            >
              {LISTING_CATEGORY_LABEL[c]}
            </Link>
          ))}
        </div>

        {mine.length > 0 ? (
          <section aria-labelledby="mine-heading" className="mt-8">
            <h2
              id="mine-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              You are selling
            </h2>
            <div className="space-y-3">
              {mine.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  thumbnail={images.get(listing.id)?.[0]}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-label="Listings" className="mt-8 space-y-3">
          {mine.length > 0 ? (
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              For sale
            </h2>
          ) : null}

          {!page.available ? (
            <ErrorState
              title="The marketplace could not be loaded"
              description="This is usually a temporary connection problem. Please try again shortly."
            />
          ) : page.listings.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="size-6" />}
              title="Nothing for sale yet"
              description="When somebody in Igbo Eze North lists something, it will appear here."
            />
          ) : (
            page.listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                thumbnail={images.get(listing.id)?.[0]}
              />
            ))
          )}
        </section>

        {page.nextCursor ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`/marketplace?${validCategory ? `category=${validCategory}&` : ""}before=${encodeURIComponent(page.nextCursor)}`}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
            >
              Show more
            </Link>
          </div>
        ) : null}
      </main>
    </>
  );
}
