import { z } from "zod";

/** Mirrors the CHECK constraints on public.events. */
export const EVENT_TITLE_MAX = 160;
export const EVENT_DESCRIPTION_MAX = 8000;
export const EVENT_VENUE_MAX = 200;
export const EVENT_REASON_MAX = 500;

export const eventKinds = [
  "festival",
  "funeral",
  "wedding",
  "meeting",
  "religious",
  "market",
  "sport",
  "fundraiser",
  "other",
] as const;

export const eventVisibilities = ["public", "community"] as const;

export const rsvpStatuses = ["going", "interested", "not_going"] as const;

/**
 * Labels for the kinds this community actually holds.
 *
 * Funerals and festivals lead deliberately: in Igbo-Eze North they are the two
 * biggest gatherings in the calendar, and a list that buried "Funeral" under
 * "Other" would be a list written for somewhere else.
 */
export const EVENT_KIND_LABEL: Record<(typeof eventKinds)[number], string> = {
  festival: "Festival",
  funeral: "Funeral",
  wedding: "Wedding",
  meeting: "Meeting",
  religious: "Church or mosque",
  market: "Market day",
  sport: "Sport",
  fundraiser: "Fundraiser",
  other: "Other",
};

export const RSVP_LABEL: Record<(typeof rsvpStatuses)[number], string> = {
  going: "Going",
  interested: "Interested",
  not_going: "Not going",
};

const optionalUuid = z
  .union([z.literal(""), z.uuid("Choose a valid community")])
  .transform((v) => (v === "" ? null : v));

const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(""), z.string().trim().max(max, message)])
    .transform((v) => (v === "" ? null : v));

/**
 * A local date-time from an `<input type="datetime-local">`, as WAT.
 *
 * The browser gives "2026-09-12T16:00" with no zone at all. Interpreting that
 * with `new Date(...)` would read it in the VIEWER's zone, so the same form
 * submitted from Lagos and from London would create two different instants for
 * one funeral. Nigeria is UTC+1 with no daylight saving, so the offset is
 * appended explicitly and is right all year.
 */
export const WAT_OFFSET = "+01:00";

export function watLocalToInstant(local: string): Date {
  return new Date(`${local}:00${WAT_OFFSET}`);
}

const localDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    "Choose a date and a time",
  );

export const createEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the event a name")
      .max(EVENT_TITLE_MAX, `A name can be at most ${EVENT_TITLE_MAX} characters`),

    description: optionalText(
      EVENT_DESCRIPTION_MAX,
      "That description is too long",
    ),
    venue: optionalText(EVENT_VENUE_MAX, "That venue is too long"),

    kind: z.enum(eventKinds),
    geoId: optionalUuid,
    visibility: z.enum(eventVisibilities),

    startsAtLocal: localDateTime,
    /** Optional. Left empty, the database fills it with the end of that day. */
    endsAtLocal: z.union([z.literal(""), localDateTime]),

    isAllDay: z
      .union([z.literal("on"), z.literal(""), z.undefined()])
      .transform((v) => v === "on"),
  })
  .refine(
    (v) =>
      v.endsAtLocal === "" ||
      watLocalToInstant(v.endsAtLocal) >= watLocalToInstant(v.startsAtLocal),
    { message: "The end cannot be before the start", path: ["endsAtLocal"] },
  );

export const rsvpSchema = z.object({
  eventId: z.uuid(),
  /**
   * The desired END STATE, never a toggle -- as for following and group
   * membership. A toggle read from stale UI does the opposite of what somebody
   * meant, and "withdraw" is a fourth state rather than the absence of one.
   */
  status: z.enum([...rsvpStatuses, "withdraw"] as const),
});

export const cancelEventSchema = z.object({
  eventId: z.uuid(),
  reason: optionalText(EVENT_REASON_MAX, "That reason is too long"),
});
