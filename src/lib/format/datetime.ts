/**
 * Every timestamp on this platform, rendered in West Africa Time.
 *
 * Found on a live walkthrough: /notifications said a message arrived at
 * "10 Sept, 23:15" while the thread it came from said "12:15 am", and in
 * Nigeria it was already 11 September. Pages rendered on the server run on
 * Vercel in UTC, so any date formatted there without an explicit timezone came
 * out an hour behind, and on the wrong DAY for the hour after midnight. Pages
 * rendered in the browser used the reader's own clock, which only looked right
 * because the tester happened to be in Nigeria.
 *
 * features/events/format.ts already solved this for events and explains why:
 * the community is in Igbo-Eze North, so a time means the time THERE, for the
 * reader in Enugu and for their brother in London alike. This file extends the
 * same rule to everything else -- notifications, messages, comments, posts,
 * issues, applications and the admin console.
 *
 * Nigeria is UTC+1 with NO daylight saving, so pinning the zone is exact all
 * year rather than an approximation that breaks twice annually.
 */

export const WAT = "Africa/Lagos";

type When = string | number | Date;

const asDate = (value: When): Date => (value instanceof Date ? value : new Date(value));

/** `toLocaleString`, pinned to West Africa Time. */
export function watString(value: When, options?: Intl.DateTimeFormatOptions): string {
  return asDate(value).toLocaleString("en-NG", { ...options, timeZone: WAT });
}

/** `toLocaleDateString`, pinned to West Africa Time. */
export function watDate(value: When, options?: Intl.DateTimeFormatOptions): string {
  return asDate(value).toLocaleDateString("en-NG", { ...options, timeZone: WAT });
}

/**
 * `toLocaleTimeString`, pinned to West Africa Time. Defaults to "4:00 pm":
 * ICU renders en-NG as 24-hour, but a time here is written "4pm" on the flyer,
 * and the events surface already states hour12 for that reason.
 */
export function watTime(value: When, options?: Intl.DateTimeFormatOptions): string {
  return asDate(value).toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
    timeZone: WAT,
  });
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: WAT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar day in West Africa Time, as "YYYY-MM-DD".
 *
 * For "is this today?" comparisons. `getDate()` answers in the zone of whatever
 * machine runs it -- UTC on the server -- so a message sent at 12:15 am in
 * Nigeria was "yesterday" for an hour every night.
 */
export function watDayKey(value: When): string {
  return dayKeyFormat.format(asDate(value));
}

/** The year in West Africa Time, for deciding whether to print it. */
export function watYear(value: When): number {
  return Number(watDayKey(value).slice(0, 4));
}

/** Relative day in West Africa Time: 0 is today, 1 is yesterday. */
export function watDaysAgo(value: When, now: When = Date.now()): number {
  const day = (v: When) => Date.parse(`${watDayKey(v)}T00:00:00Z`);
  return Math.round((day(now) - day(value)) / 86_400_000);
}
