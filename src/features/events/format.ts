/**
 * Rendering event times.
 *
 * Every one of these pins `timeZone: 'Africa/Lagos'`, and that is the whole
 * point of the file. Without it the same event reads as 4pm to somebody in
 * Enugu and 3pm to their brother in London -- and the brother in London is the
 * one who would turn up at the wrong time, because the event is happening in
 * Igbo-Eze North either way.
 *
 * Nigeria is UTC+1 with NO daylight saving, so this is exact all year rather
 * than an approximation that breaks twice annually.
 */

const ZONE = "Africa/Lagos";

const dayFormat = new Intl.DateTimeFormat("en-NG", {
  timeZone: ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDayFormat = new Intl.DateTimeFormat("en-NG", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

// hour12 is stated rather than left to the locale. ICU renders en-NG as
// 24-hour, but an event here is written "4pm" on the flyer and said "four
// o'clock" out loud, and a funeral time is the last place to be clever.
const timeFormat = new Intl.DateTimeFormat("en-NG", {
  timeZone: ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function eventDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

export function eventShortDay(iso: string): string {
  return shortDayFormat.format(new Date(iso));
}

export function eventTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "Saturday, 12 September 2026 at 4:00 pm", or just the day for an all-day event. */
export function eventWhen(
  startsAt: string,
  endsAt: string,
  isAllDay: boolean,
): string {
  const day = eventDay(startsAt);
  if (isAllDay) return `${day}, all day`;

  const start = eventTime(startsAt);

  // An end is only worth showing when somebody actually gave one. The trigger
  // fills a missing one with the midnight ending the event's own day, and
  // printing "until Sunday, 12:00 am" would be reporting a default as though
  // it were a decision.
  //
  // Checked FIRST, and by instant rather than by formatted time. A filled end
  // always lands on the following day, so testing it inside a "same day"
  // branch made the suppression unreachable -- and comparing the rendered
  // "12:00 am" would also have swallowed a genuine end at midnight some other
  // night.
  if (new Date(endsAt).getTime() === new Date(midnightAfter(startsAt)).getTime()) {
    return `${day}, ${start}`;
  }

  if (eventDay(endsAt) === day) {
    return `${day}, ${start} – ${eventTime(endsAt)}`;
  }
  return `${day}, ${start} – ${eventDay(endsAt)}, ${eventTime(endsAt)}`;
}

/** The instant of midnight ending the given instant's day, in WAT. */
function midnightAfter(iso: string): string {
  // Built from the WAT calendar date rather than by adding 24 hours, so an
  // event at 11pm gets the following midnight rather than the one after.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  const next = new Date(`${parts}T00:00:00+01:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** True when the event has not finished yet. */
export function isUpcoming(endsAt: string): boolean {
  return new Date(endsAt).getTime() >= Date.now();
}

/** True while the event is actually running. */
export function isHappeningNow(startsAt: string, endsAt: string): boolean {
  const now = Date.now();
  return new Date(startsAt).getTime() <= now && new Date(endsAt).getTime() >= now;
}

/**
 * "in 3 days", "tomorrow", "today". Null once it has started.
 *
 * Counted in WHOLE WAT DAYS rather than in 24-hour blocks: an event tomorrow
 * morning is "tomorrow" even when it is 20 hours away, and an event this
 * evening is "today" even when it is 10 hours away. Anything else tells
 * somebody an event is "in 1 day" on the morning it happens.
 */
export function countdownLabel(startsAt: string): string | null {
  const start = new Date(startsAt);
  if (start.getTime() < Date.now()) return null;

  const dayNumber = (d: Date) => {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return Math.floor(new Date(`${ymd}T00:00:00+01:00`).getTime() / 86400000);
  };

  const days = dayNumber(start) - dayNumber(new Date());
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.floor(days / 7)} weeks`;
}
