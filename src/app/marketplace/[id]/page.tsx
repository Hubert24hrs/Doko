import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Mail, MapPin, Phone, Truck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getListing } from "@/features/marketplace/queries";
import { getListingImages } from "@/features/marketplace/media-queries";
import {
  LISTING_CATEGORY_LABEL,
  LISTING_CONDITION_LABEL,
  LISTING_STATUS_LABEL,
  priceLabel,
} from "@/features/marketplace/schemas";
import { ListingGallery } from "@/features/marketplace/components/listing-gallery";
import { SellerControls } from "@/features/marketplace/components/seller-controls";
import { canMessage } from "@/features/messages/queries";
import { MessageButton } from "@/features/messages/components/message-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) {
    return { title: "Listing", robots: { index: false, follow: false } };
  }

  const indexable = listing.group_id === null && listing.visibility === "public";

  return {
    title:
      listing.status === "sold" ? `Sold: ${listing.title}` : listing.title,
    description: listing.description.slice(0, 160),
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: indexable ? { canonical: `/marketplace/${listing.id}` } : undefined,
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [listing, viewer] = await Promise.all([getListing(id), getSessionUser()]);
  if (!listing) notFound();

  const isSeller = viewer?.id === listing.seller_id;
  const notAvailable = listing.status !== "available";

  const [images, messageable] = await Promise.all([
    getListingImages([id]).then((m) => m.get(id) ?? []),
    viewer && !isSeller ? canMessage(listing.seller_id) : Promise.resolve(false),
  ]);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Marketplace
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {listing.status === "sold" ? (
          <div className="mb-4 rounded-lg border border-border-strong bg-surface-sunken px-4 py-3 text-sm text-foreground">
            <strong className="font-semibold">This has been sold.</strong> It
            stays listed so anyone with the link can see it went.
          </div>
        ) : null}

        <ListingGallery images={images} />

        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {listing.title}
              </h1>
              {notAvailable ? (
                <Badge variant="neutral">{LISTING_STATUS_LABEL[listing.status]}</Badge>
              ) : null}
            </div>

            <p className="mt-1 text-xl font-semibold text-foreground">
              {priceLabel(listing.price, listing.price_is_negotiable)}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{LISTING_CATEGORY_LABEL[listing.category]}</span>
              {listing.condition ? (
                <span>{LISTING_CONDITION_LABEL[listing.condition]}</span>
              ) : null}
              {listing.can_deliver ? (
                <span className="inline-flex items-center gap-1">
                  <Truck className="size-4" aria-hidden="true" />
                  Can deliver
                </span>
              ) : null}
            </div>

            {listing.location_text || listing.community ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                {[listing.location_text, listing.community?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}

            <p className="mt-4 whitespace-pre-wrap break-words text-foreground">
              {listing.description}
            </p>

            {listing.seller ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Sold by{" "}
                <Link
                  href={`/members/${listing.seller.username}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {listing.seller.full_name}
                </Link>
                {listing.seller.is_verified ? (
                  <>
                    {" "}
                    <VerifiedBadge />
                  </>
                ) : null}
                {listing.edited_at ? " · edited" : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {!isSeller ? (
          <section aria-labelledby="contact-heading" className="mt-6">
            <h2
              id="contact-heading"
              className="mb-3 text-sm font-semibold text-foreground"
            >
              Get in touch
            </h2>

            <div className="space-y-3">
              {messageable ? <MessageButton otherUserId={listing.seller_id} /> : null}

              {/* listing.contact is null both for a signed-out reader (no anon
                  policy on listing_contacts, ever) and for a seller who simply
                  never added one -- "Message the seller" above covers both. */}
              {listing.contact ? (
                <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
                  {listing.contact.contact_name ? (
                    <p className="text-foreground">
                      Ask for {listing.contact.contact_name}
                    </p>
                  ) : null}
                  {listing.contact.contact_phone ? (
                    <p className="flex items-center gap-2 text-foreground">
                      <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                      <a
                        href={`tel:${listing.contact.contact_phone.replace(/\s/g, "")}`}
                        className="hover:underline"
                      >
                        {listing.contact.contact_phone}
                      </a>
                    </p>
                  ) : null}
                  {listing.contact.contact_email ? (
                    <p className="flex items-center gap-2 text-foreground">
                      <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                      <a
                        href={`mailto:${listing.contact.contact_email}`}
                        className="hover:underline"
                      >
                        {listing.contact.contact_email}
                      </a>
                    </p>
                  ) : null}
                  {listing.contact.external_url ? (
                    <p className="text-foreground">
                      <a
                        href={listing.contact.external_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-primary hover:underline"
                      >
                        More about it
                      </a>
                    </p>
                  ) : null}
                  {listing.contact.instructions ? (
                    <p className="whitespace-pre-wrap break-words text-muted-foreground">
                      {listing.contact.instructions}
                    </p>
                  ) : null}
                </div>
              ) : viewer ? null : (
                <div className="rounded-lg border border-border bg-surface-sunken p-4">
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Sign in to message the seller or see any contact details
                    they have shared.
                  </p>
                  <Link
                    href={`/login?next=${encodeURIComponent(`/marketplace/${listing.id}`)}`}
                    className="mt-3 inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="mt-8">
            <SellerControls listingId={listing.id} status={listing.status} />
          </section>
        )}
      </main>
    </>
  );
}
