import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Briefcase, ShoppingBag, TriangleAlert, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import {
  canEditCommunity,
  getGeoAncestors,
  getGeoChildren,
  getGeoDescendantIds,
  getGeoEntityBySlug,
} from "@/features/geo/queries";
import { EditCommunityForm } from "@/features/geo/components/edit-community-form";
import { getFeedPage } from "@/features/posts/queries";
import { getUpcomingEvents } from "@/features/events/queries";
import { getOpenJobs } from "@/features/jobs/queries";
import { getListings } from "@/features/marketplace/queries";
import { getIssues } from "@/features/issues/queries";
import { PostCard } from "@/features/posts/components/post-card";
import { EventCard } from "@/features/events/components/event-card";
import { JobCard } from "@/features/jobs/components/job-card";
import { ListingCard } from "@/features/marketplace/components/listing-card";
import { IssueCard } from "@/features/issues/components/issue-card";
import { getSessionUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  lga: "Local Government Area",
  town: "Town",
  autonomous_community: "Autonomous community",
  district: "District",
  village: "Village",
  area: "Ward",
};

/** Plural headings for a group of children of one kind. */
const GROUP_LABEL: Record<string, string> = {
  town: "Towns",
  autonomous_community: "Autonomous communities",
  district: "Districts",
  village: "Villages",
  area: "INEC council wards",
};

/** Traditional hierarchy first; wards are an electoral overlay on top of it. */
const GROUP_ORDER: Record<string, number> = {
  town: 0,
  autonomous_community: 1,
  district: 2,
  village: 3,
  area: 4,
};

/** What the children of each level are actually called, for the sub-list heading. */
const CHILD_LABEL: Record<string, string> = {
  lga: "Towns",
  town: "Districts and wards",
  autonomous_community: "Villages",
  district: "Villages and wards",
  village: "Areas",
  area: "Areas",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = await getGeoEntityBySlug(slug);
  if (!place) return { title: "Community not found" };

  const kind = KIND_LABEL[place.kind] ?? place.kind;
  return {
    title: `${place.name} — ${kind} in Igbo Eze North`,
    description:
      place.description ??
      `${place.name}, a ${kind.toLowerCase()} of Igbo Eze North Local Government Area, Enugu State. Posts, events, jobs, listings and reported issues from ${place.name}.`,
    alternates: { canonical: `/communities/${place.slug}` },
  };
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const place = await getGeoEntityBySlug(slug);

  if (!place) notFound();

  // Migration 002 keeps a merged entity's row and points it at its successor
  // precisely so old references stay resolvable. Honour that here rather than
  // 404ing a link somebody wrote down two years ago.
  if (place.merged_into_id) {
    const target = await getGeoEntityById(place.merged_into_id);
    if (target) redirect(`/communities/${target.slug}`);
  }

  const [ancestors, children, geoIds, user, canEdit] = await Promise.all([
    getGeoAncestors(place.id),
    getGeoChildren(place.id),
    getGeoDescendantIds(place.id),
    getSessionUser(),
    canEditCommunity(place.id),
  ]);

  // Everything below is scoped to the place AND everything beneath it. A post
  // about the Nkwo market carries the village's geo_id, never the town's, so a
  // town filtered on its own id alone would read as empty while containing
  // thirty busy villages.
  const [feed, events, jobs, listings, issues] = await Promise.all([
    getFeedPage(undefined, undefined, geoIds),
    getUpcomingEvents(undefined, { geoIds }),
    getOpenJobs(undefined, { geoIds }),
    getListings(undefined, { geoIds }),
    getIssues(undefined, { geoIds }),
  ]);

  const kindLabel = KIND_LABEL[place.kind] ?? place.kind;
  const childLabel = CHILD_LABEL[place.kind] ?? "Communities within";

  // Grouped by kind rather than listed together, because Enugu-Ezike's children
  // are four traditional districts AND twenty INEC council wards -- two
  // different things, and several share a name. Listed flat, "Ezzodo" appeared
  // twice with nothing to tell the district from the ward. Wards are an
  // electoral overlay on the traditional hierarchy, not a level of it.
  const childGroups = Object.entries(
    children.reduce<Record<string, typeof children>>((acc, child) => {
      (acc[child.kind] ??= []).push(child);
      return acc;
    }, {}),
  ).sort(
    ([a], [b]) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99),
  );

  // The ancestors RPC returns root-first and includes the entity itself.
  const trail = ancestors.filter(
    (a: { id: string }) => a.id !== place.id,
  ) as { id: string; name: string; slug: string }[];

  const nothingYet =
    feed.posts.length === 0 &&
    events.events.length === 0 &&
    jobs.jobs.length === 0 &&
    listings.listings.length === 0 &&
    issues.issues.length === 0;

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Ezike Oba
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href="/communities" className="hover:underline">
          Communities
        </Link>
        {trail.map((a) => (
          <span key={a.id}>
            <span aria-hidden="true"> / </span>
            <Link href={`/communities/${a.slug}`} className="hover:underline">
              {a.name}
            </Link>
          </span>
        ))}
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{place.name}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {place.name}
        </h1>
        <Badge variant="primary">{kindLabel}</Badge>
      </div>

      {place.aliases.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          also called {place.aliases.join(", ")}
        </p>
      ) : null}

      {place.description ? (
        <p className="mt-3 max-w-2xl text-muted-foreground">{place.description}</p>
      ) : null}

      {/* Offered only where the write would actually land. A community admin
          is not staff and cannot reach /admin, so this page is their editing
          surface — which is also where they are standing when they notice the
          misspelling. */}
      {canEdit ? <EditCommunityForm place={place} /> : null}

      {childGroups.length > 0 ? (
        <section className="mt-8" aria-labelledby="within">
          <h2 id="within" className="sr-only">
            {childLabel}
          </h2>
          <div className="space-y-5">
            {childGroups.map(([kind, group]) => (
              <div key={kind}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABEL[kind] ?? kind}
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {group.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/communities/${child.slug}`}
                        className="inline-flex rounded-full border border-border bg-surface px-3 py-1 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {nothingYet ? (
        <EmptyState
          className="mt-10"
          icon={<MapPin className="size-6" />}
          title={`Nothing from ${place.name} yet`}
          description={
            user
              ? `Nobody has posted, listed a job, advertised an item or reported an issue in ${place.name} so far. Be the first — anything you tag to this community will appear here.`
              : `Nobody has posted, listed a job, advertised an item or reported an issue in ${place.name} so far. Sign in to be the first.`
          }
        />
      ) : null}

      <Section
        title="Posts"
        href="/feed"
        linkLabel="the whole feed"
        count={feed.posts.length}
      >
        <div className="space-y-4">
          {feed.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canManage={false}
              showConversationLink
            />
          ))}
        </div>
      </Section>

      <Section
        title="Upcoming events"
        href="/events"
        linkLabel="all events"
        count={events.events.length}
        icon={<CalendarDays className="size-4" aria-hidden="true" />}
      >
        <div className="space-y-4">
          {events.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </Section>

      <Section
        title="Jobs"
        href="/jobs"
        linkLabel="all jobs"
        count={jobs.jobs.length}
        icon={<Briefcase className="size-4" aria-hidden="true" />}
      >
        <div className="space-y-4">
          {jobs.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </Section>

      <Section
        title="For sale"
        href="/marketplace"
        linkLabel="the whole marketplace"
        count={listings.listings.length}
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </Section>

      <Section
        title="Reported issues"
        href="/issues"
        linkLabel="all issues"
        count={issues.issues.length}
        icon={<TriangleAlert className="size-4" aria-hidden="true" />}
      >
        <div className="space-y-4">
          {issues.issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      </Section>
    </main>
  );
}

/**
 * A section renders nothing at all when it is empty, rather than an empty
 * heading over a blank space. The page-level empty state covers the case where
 * every section is empty; a village with events but no jobs should simply not
 * have a Jobs heading.
 */
function Section({
  title,
  href,
  linkLabel,
  count,
  icon,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  count: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <section className="mt-10" aria-labelledby={href}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          id={href}
          className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground"
        >
          {icon}
          {title}
        </h2>
        <Link href={href} className="text-sm text-primary hover:underline">
          Browse {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Only needed for the merge redirect, so it is not worth a shared export. */
async function getGeoEntityById(id: string) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("geo_entities")
    .select("slug")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}
