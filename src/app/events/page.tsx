import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getPastEvents, getUpcomingEvents } from "@/features/events/queries";
import { EventCard } from "@/features/events/components/event-card";
import { EVENT_KIND_LABEL, eventKinds } from "@/features/events/schemas";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Festivals, funerals, meetings and market days across Igbo Eze North.",
  alternates: { canonical: "/events" },
};

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; kind?: string; view?: string }>;
}) {
  const { after, kind, view } = await searchParams;
  const viewer = await getSessionUser();

  const past = view === "past";
  const validKind = eventKinds.find((k) => k === kind);

  const page = past
    ? await getPastEvents(after)
    : await getUpcomingEvents(after, { kind: validKind });

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {viewer ? (
              <>
                <Link
                  href="/feed"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
                >
                  Feed
                </Link>
                <Link
                  href="/events/new"
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover shadow-sm"
                >
                  Add an Event
                </Link>
              </>
            ) : (
              <Link
                href="/login?next=%2Fevents"
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Nano Banana Events Header Banner */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative h-44 w-full sm:h-52">
            <img
              src="/images/events-banner.jpg"
              alt="Igbo Eze North Cultural Events & Summits"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
          <div className="relative -mt-14 px-6 pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Community Events & Cultural Summits
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Festivals, funerals, town hall meetings, and traditional market days across Igbo Eze North. All times in West Africa Time.
            </p>
          </div>
        </div>

        <nav aria-label="Event view" className="mt-6 flex gap-1 border-b border-border">
          <Link
            href="/events"
            aria-current={past ? undefined : "page"}
            className={
              past
                ? "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                : "border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
            }
          >
            Coming up
          </Link>
          <Link
            href="/events?view=past"
            aria-current={past ? "page" : undefined}
            className={
              past
                ? "border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            Already held
          </Link>
        </nav>

        {!past ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Link
              href="/events"
              className={
                validKind
                  ? "rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-sunken"
                  : "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              }
            >
              All
            </Link>
            {eventKinds.map((k) => (
              <Link
                key={k}
                href={`/events?kind=${k}`}
                className={
                  validKind === k
                    ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    : "rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-sunken"
                }
              >
                {EVENT_KIND_LABEL[k]}
              </Link>
            ))}
          </div>
        ) : null}

        <section aria-label="Events" className="mt-6 space-y-3">
          {!page.available ? (
            <ErrorState
              title="Events could not be loaded"
              description="This is usually a temporary connection problem. Please try again shortly."
            />
          ) : page.events.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title={past ? "Nothing here yet" : "Nothing coming up"}
              description={
                past
                  ? "Events that have finished will be kept here."
                  : "Be the first to tell Igbo-Eze North what is happening."
              }
            />
          ) : (
            page.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          )}
        </section>

        {page.nextCursor ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`/events?${past ? "view=past&" : validKind ? `kind=${validKind}&` : ""}after=${encodeURIComponent(page.nextCursor)}`}
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
