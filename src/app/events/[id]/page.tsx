import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { getSessionUser, isStaff } from "@/features/auth/session";
import { getAttendees, getEvent } from "@/features/events/queries";
import { EVENT_KIND_LABEL } from "@/features/events/schemas";
import { eventWhen, isHappeningNow } from "@/features/events/format";
import { RsvpButtons } from "@/features/events/components/rsvp-buttons";
import { OrganiserControls } from "@/features/events/components/organiser-controls";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    return { title: "Event", robots: { index: false, follow: false } };
  }

  // Indexable only when the whole internet may see it anyway. A community or
  // group event carries a title that is nobody else's business.
  const indexable = event.group_id === null && event.visibility === "public";

  return {
    title: event.cancelled_at ? `Cancelled: ${event.title}` : event.title,
    description:
      event.description?.slice(0, 160) ??
      `${EVENT_KIND_LABEL[event.kind]} in Igbo-Eze North.`,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: indexable ? { canonical: `/events/${event.id}` } : undefined,
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // No requireUser: a public event is readable by signed-out visitors and RLS
  // decides. One the caller may not see returns null and 404s, which does not
  // confirm that it exists.
  const [event, viewer] = await Promise.all([getEvent(id), getSessionUser()]);
  if (!event) notFound();

  const attendees = await getAttendees(id);
  const cancelled = event.cancelled_at !== null;
  const isOrganiser = viewer?.id === event.organizer_id;
  const canManage = isOrganiser || (viewer ? isStaff(viewer) : false);
  const now = !cancelled && isHappeningNow(event.starts_at, event.ends_at);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All events
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {cancelled ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            <strong className="font-semibold">This event was cancelled.</strong>
            {event.cancellation_reason ? ` ${event.cancellation_reason}` : ""}
          </div>
        ) : null}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {event.title}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                {now ? <Badge>Happening now</Badge> : null}
                <Badge variant="neutral">{EVENT_KIND_LABEL[event.kind]}</Badge>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <dt className="mt-0.5 text-muted-foreground">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  <span className="sr-only">When</span>
                </dt>
                <dd className="text-foreground">
                  <time dateTime={event.starts_at}>
                    {eventWhen(event.starts_at, event.ends_at, event.is_all_day)}
                  </time>
                  <span className="block text-xs text-muted-foreground">
                    West Africa Time
                  </span>
                </dd>
              </div>

              {event.venue || event.community ? (
                <div className="flex items-start gap-2">
                  <dt className="mt-0.5 text-muted-foreground">
                    <MapPin className="size-4" aria-hidden="true" />
                    <span className="sr-only">Where</span>
                  </dt>
                  <dd className="text-foreground">
                    {event.venue}
                    {event.venue && event.community ? " · " : ""}
                    {/* Not a link: there is no per-community page yet, and a
                        link to one would 404 from the most prominent line on
                        the page. */}
                    {event.community ? event.community.name : null}
                  </dd>
                </div>
              ) : null}

              <div className="flex items-start gap-2">
                <dt className="mt-0.5 text-muted-foreground">
                  <Users className="size-4" aria-hidden="true" />
                  <span className="sr-only">Who is coming</span>
                </dt>
                <dd className="text-foreground">
                  {event.going_count.toLocaleString("en-NG")} going
                  {event.interested_count > 0
                    ? `, ${event.interested_count.toLocaleString("en-NG")} interested`
                    : ""}
                </dd>
              </div>
            </dl>

            {event.description ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-foreground">
                {event.description}
              </p>
            ) : null}

            {event.organizer ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Organised by{" "}
                <Link
                  href={`/members/${event.organizer.username}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {event.organizer.full_name}
                </Link>
                {event.organizer.is_verified ? (
                  <>
                    {" "}
                    <VerifiedBadge />
                  </>
                ) : null}
                {event.edited_at ? " · edited" : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section aria-labelledby="rsvp-heading" className="mt-6">
          <h2 id="rsvp-heading" className="mb-3 text-sm font-semibold text-foreground">
            Are you coming?
          </h2>
          {viewer ? (
            <RsvpButtons
              eventId={event.id}
              status={event.viewerStatus}
              disabled={cancelled}
            />
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(`/events/${event.id}`)}`}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
            >
              Sign in to reply
            </Link>
          )}
        </section>

        {attendees.length > 0 ? (
          <section aria-labelledby="attendees-heading" className="mt-8">
            <h2
              id="attendees-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Coming
            </h2>
            <ul className="flex flex-wrap gap-2">
              {/* Only 'going' and 'interested' are listed. "Can't go" is worth
                  collecting for the organiser and needlessly public to show --
                  naming everybody who declined a funeral would discourage
                  people from answering honestly at all. */}
              {attendees.map((attendee) => (
                <li key={attendee.user_id}>
                  <Link
                    href={`/members/${attendee.profile?.username ?? ""}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-sunken"
                  >
                    {attendee.profile?.full_name ?? "A member"}
                    {attendee.status === "interested" ? (
                      <span className="text-muted-foreground">· maybe</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {canManage ? (
          <section className="mt-8">
            <OrganiserControls eventId={event.id} cancelled={cancelled} />
          </section>
        ) : null}
      </main>
    </>
  );
}
