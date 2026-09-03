import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EventKind, EventRow, RsvpStatus } from "@/types/database";

export interface EventSummary extends EventRow {
  organizer: {
    username: string;
    full_name: string;
    is_verified: boolean;
  } | null;
  community: { name: string; slug: string } | null;
}

export interface EventDetail extends EventSummary {
  /** The caller's own RSVP, or null when they have not answered. */
  viewerStatus: RsvpStatus | null;
}

export interface EventPage {
  events: EventSummary[];
  /** Cursor for the next page: the starts_at of the last row returned. */
  nextCursor: string | null;
  /** False when the listing could not be read at all, as opposed to empty. */
  available: boolean;
}

export const EVENTS_PAGE_SIZE = 20;

const EVENT_FIELDS = `
  id, title, description, kind, geo_id, venue, starts_at, ends_at, is_all_day,
  organizer_id, group_id, visibility, cancelled_at, cancellation_reason,
  going_count, interested_count, created_at, updated_at, edited_at, deleted_at,
  organizer:organizer_id ( username, full_name, is_verified ),
  community:geo_id ( name, slug )
`;

/**
 * Upcoming events, soonest first.
 *
 * **Filtered on `ends_at`, ordered by `starts_at`**, and the difference
 * matters more than it looks. An event that began an hour ago and runs all day
 * is still happening, and filtering on `starts_at` would drop a funeral from
 * the listing at exactly the hour people are most likely to be looking it up.
 * `ends_at` is never null -- a trigger fills it with the end of the event's own
 * day in WAT -- so this is one indexed comparison rather than a rule restated
 * here.
 *
 * No visibility filter: RLS decides what this caller may see, and a second
 * copy of those rules in the query would be the copy that drifts.
 */
export async function getUpcomingEvents(
  cursor?: string,
  options?: { geoId?: string; kind?: EventKind; groupId?: string },
): Promise<EventPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("events")
      .select(EVENT_FIELDS)
      .is("deleted_at", null)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(EVENTS_PAGE_SIZE);

    if (cursor) query = query.gt("starts_at", cursor);
    if (options?.geoId) query = query.eq("geo_id", options.geoId);
    if (options?.kind) query = query.eq("kind", options.kind);
    if (options?.groupId) query = query.eq("group_id", options.groupId);

    const { data, error } = await query;
    if (error) {
      console.error("[events.upcoming] failed", error.message);
      return { events: [], nextCursor: null, available: false };
    }

    const events = (data ?? []) as unknown as EventSummary[];
    const nextCursor =
      events.length === EVENTS_PAGE_SIZE
        ? events[events.length - 1].starts_at
        : null;

    return { events, nextCursor, available: true };
  } catch (cause) {
    console.error("[events.upcoming] unavailable", cause);
    return { events: [], nextCursor: null, available: false };
  }
}

/**
 * Events that have already finished, most recent first.
 *
 * Kept reachable rather than dropped: a community's record of what it held
 * last year is worth something, and an organiser needs to find the event they
 * ran in order to run it again.
 */
export async function getPastEvents(cursor?: string): Promise<EventPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("events")
      .select(EVENT_FIELDS)
      .is("deleted_at", null)
      .lt("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: false })
      .limit(EVENTS_PAGE_SIZE);

    if (cursor) query = query.lt("starts_at", cursor);

    const { data, error } = await query;
    if (error) {
      console.error("[events.past] failed", error.message);
      return { events: [], nextCursor: null, available: false };
    }

    const events = (data ?? []) as unknown as EventSummary[];
    const nextCursor =
      events.length === EVENTS_PAGE_SIZE
        ? events[events.length - 1].starts_at
        : null;

    return { events, nextCursor, available: true };
  } catch (cause) {
    console.error("[events.past] unavailable", cause);
    return { events: [], nextCursor: null, available: false };
  }
}

/**
 * One event, with the caller's own RSVP.
 *
 * Null when it does not exist OR the caller may not see it -- indistinguishable
 * on purpose, so the page 404s rather than confirming that a private group's
 * event exists.
 */
export async function getEvent(eventId: string): Promise<EventDetail | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("events")
      .select(EVENT_FIELDS)
      .eq("id", eventId)
      .maybeSingle();

    if (error) {
      console.error("[events.get] failed", error.message);
      return null;
    }
    if (!data) return null;

    const event = data as unknown as EventSummary;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let viewerStatus: RsvpStatus | null = null;
    if (user) {
      const { data: rsvp } = await supabase
        .from("event_attendees")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      viewerStatus = rsvp?.status ?? null;
    }

    return { ...event, viewerStatus };
  } catch (cause) {
    console.error("[events.get] unavailable", cause);
    return null;
  }
}

export interface Attendee {
  user_id: string;
  status: RsvpStatus;
  profile: {
    username: string;
    full_name: string;
    is_verified: boolean;
  } | null;
}

/**
 * Who has said they are coming.
 *
 * 'not_going' is excluded from the listing on purpose. It is a useful answer
 * for the organiser's count and a needlessly public one to display -- naming
 * everybody who declined a funeral would be unkind and would discourage people
 * from answering honestly at all.
 */
export async function getAttendees(eventId: string): Promise<Attendee[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("event_attendees")
      .select(
        "user_id, status, profile:user_id ( username, full_name, is_verified )",
      )
      .eq("event_id", eventId)
      .in("status", ["going", "interested"])
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[events.attendees] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as Attendee[];
  } catch (cause) {
    console.error("[events.attendees] unavailable", cause);
    return [];
  }
}
