import { describe, expect, it } from "vitest";

import {
  eventDay,
  eventTime,
  eventWhen,
  isHappeningNow,
  isUpcoming,
} from "@/features/events/format";
import { watLocalToInstant } from "@/features/events/schemas";

/**
 * These tests exist because an event is a promise about a time and a place,
 * and the failure mode is somebody driving to a funeral on the wrong day.
 *
 * They are written as fixed UTC instants with the expected WAT rendering, so
 * they fail if the timeZone pin is ever dropped -- which on a machine that
 * happens to run in UTC+1 would otherwise go completely unnoticed.
 */

describe("watLocalToInstant", () => {
  it("reads a form value as West Africa Time, not as the viewer's time", () => {
    // 4pm in Enugu is 15:00 UTC. Without the explicit offset this would be
    // parsed in whatever zone the browser or server happened to be in, so the
    // same form submitted from Lagos and from London would create two
    // different instants for one event.
    expect(watLocalToInstant("2026-09-12T16:00").toISOString()).toBe(
      "2026-09-12T15:00:00.000Z",
    );
  });

  it("uses a fixed offset all year, because Nigeria has no daylight saving", () => {
    // Midwinter and midsummer must produce the same offset. In a zone with DST
    // one of these would be an hour out.
    expect(watLocalToInstant("2026-01-15T09:00").toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
    expect(watLocalToInstant("2026-07-15T09:00").toISOString()).toBe(
      "2026-07-15T08:00:00.000Z",
    );
  });
});

describe("eventTime", () => {
  it("renders in WAT regardless of where it is read", () => {
    expect(eventTime("2026-09-12T15:00:00.000Z")).toMatch(/^4:00\s?pm$/i);
  });

  it("puts a late-evening UTC instant on the NEXT day in WAT", () => {
    // 23:30 UTC is 00:30 the following morning in Lagos. A renderer without
    // the zone pin would show the wrong date for every event after 11pm UTC.
    expect(eventDay("2026-09-12T23:30:00.000Z")).toContain("13 September");
  });
});

describe("eventWhen", () => {
  const midnightAfter = "2026-09-12T23:00:00.000Z"; // 00:00 on the 13th, WAT

  it("says 'all day' instead of inventing a time", () => {
    const label = eventWhen("2026-09-12T08:00:00.000Z", midnightAfter, true);
    expect(label).toContain("all day");
    expect(label).not.toMatch(/\d:\d\d/);
  });

  it("does not report the filled-in end as though somebody chose it", () => {
    // The trigger fills a missing end with midnight. Printing "until 12:00 am"
    // would present a default as a decision.
    const label = eventWhen("2026-09-12T15:00:00.000Z", midnightAfter, false);
    expect(label).not.toMatch(/12:00/);
    expect(label).toMatch(/4:00/);
  });

  it("shows a real end time when one was given", () => {
    const label = eventWhen(
      "2026-09-12T15:00:00.000Z",
      "2026-09-12T17:00:00.000Z",
      false,
    );
    expect(label).toMatch(/4:00/);
    expect(label).toMatch(/6:00/);
  });

  it("names both days when an event runs past midnight", () => {
    const label = eventWhen(
      "2026-09-12T20:00:00.000Z", // 9pm WAT on the 12th
      "2026-09-13T02:00:00.000Z", // 3am WAT on the 13th
      false,
    );
    expect(label).toContain("12 September");
    expect(label).toContain("13 September");
  });
});

describe("isUpcoming and isHappeningNow", () => {
  const hours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

  it("counts an event that has started but not finished as still upcoming", () => {
    // THE case this whole design is arranged around. Filtering on the start
    // would drop a funeral from the listing at the hour people are most likely
    // to be looking it up.
    const started = hours(-1);
    const ends = hours(6);
    expect(isUpcoming(ends)).toBe(true);
    expect(isHappeningNow(started, ends)).toBe(true);
  });

  it("stops counting it once it has finished", () => {
    expect(isUpcoming(hours(-1))).toBe(false);
    expect(isHappeningNow(hours(-5), hours(-1))).toBe(false);
  });

  it("does not call a future event 'happening now'", () => {
    expect(isHappeningNow(hours(2), hours(6))).toBe(false);
    expect(isUpcoming(hours(6))).toBe(true);
  });
});
