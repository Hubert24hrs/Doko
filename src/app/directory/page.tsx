import type { Metadata } from "next";
import Link from "next/link";
import { Search, UsersRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getVillageOptions } from "@/features/geo/queries";
import { searchDirectory } from "@/features/directory/queries";

export const metadata: Metadata = {
  title: "Directory",
  description:
    "Find people across Igbo Eze North by name, trade or community.",
  alternates: { canonical: "/directory" },
};

export const dynamic = "force-dynamic";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; geoId?: string; after?: string }>;
}) {
  const { q, geoId, after } = await searchParams;
  const viewer = await getSessionUser();

  const [villages, page] = await Promise.all([
    getVillageOptions(),
    searchDirectory({ q, geoId, cursor: after }),
  ]);

  // Carried into the "show more" link so a filtered search keeps its filters
  // when paged.
  const carried = new URLSearchParams();
  if (q) carried.set("q", q);
  if (geoId) carried.set("geoId", geoId);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/communities"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Communities
            </Link>
            {viewer ? (
              <Link
                href="/feed"
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                Feed
              </Link>
            ) : (
              <Link
                href="/login?next=%2Fdirectory"
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Nano Banana Directory Header Banner */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative h-44 w-full sm:h-52">
            <img
              src="/images/directory-banner.jpg"
              alt="Igbo Eze North Verified Citizens Directory"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
          <div className="relative -mt-14 px-6 pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Citizens & Professional Grid
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Find verified people across Igbo Eze North by name, trade, or community.
              {viewer ? null : " Sign in to connect with neighbours who share your village."}
            </p>
          </div>
        </div>

        {/* A GET form, so a search is a URL somebody can bookmark or share and
            the back button behaves. No client JavaScript is involved at all. */}
        <form method="get" className="mt-6 flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="A name, or a trade like tailor"
              aria-label="Search the directory"
              className="h-10 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <select
            name="geoId"
            defaultValue={geoId ?? ""}
            aria-label="Community"
            className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
          >
            <option value="">Anywhere</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Search
          </button>
        </form>

        <section aria-label="Members" className="mt-6 space-y-3">
          {!page.available ? (
            <ErrorState
              title="The directory could not be loaded"
              description="This is usually a temporary connection problem. Please try again shortly."
            />
          ) : page.members.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="size-6" />}
              title={q || geoId ? "Nobody matched that" : "Nobody to show yet"}
              description={
                q || geoId
                  ? "Try a different name, trade or community."
                  : "As members join and make their profiles visible, they will appear here."
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {page.members.map((member) => (
                <li key={member.id}>
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/members/${member.username}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {member.full_name}
                        </Link>
                        {member.is_verified ? <VerifiedBadge type={member.verification_type} /> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @{member.username}
                      </p>

                      {member.occupation ? (
                        <p className="mt-2 text-sm text-foreground">
                          {member.occupation}
                        </p>
                      ) : null}

                      {member.villageName || member.townName ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[member.villageName, member.townName]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}

                      {member.bio ? (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {member.bio}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {page.nextCursor ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`/directory?${carried.toString()}${carried.size ? "&" : ""}after=${encodeURIComponent(page.nextCursor)}`}
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
