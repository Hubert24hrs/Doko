import { describe, expect, it } from "vitest";

import {
  watDate,
  watDayKey,
  watDaysAgo,
  watString,
  watTime,
  watYear,
} from "@/lib/format/datetime";

// The exact moment from the live walkthrough: a message sent at 00:15 on
// 11 September in Nigeria, which is 23:15 on 10 September in UTC.
const JUST_AFTER_MIDNIGHT_WAT = "2026-09-10T23:15:00Z";

describe("West Africa Time formatting", () => {
  it("puts a 23:15 UTC timestamp on the NEXT day in Nigeria", () => {
    expect(watDayKey(JUST_AFTER_MIDNIGHT_WAT)).toBe("2026-09-11");
  });

  it("renders that moment as a quarter past midnight, not 11:15 pm", () => {
    expect(watTime(JUST_AFTER_MIDNIGHT_WAT).toLowerCase()).toBe("12:15 am");
  });

  it("renders the date as 11 September, not the 10th /notifications showed", () => {
    const text = watString(JUST_AFTER_MIDNIGHT_WAT, { day: "numeric", month: "short" });
    expect(text).toContain("11");
    expect(text).not.toContain("10");
  });

  it("formats a date-only value in Lagos too", () => {
    expect(watDate(JUST_AFTER_MIDNIGHT_WAT, { day: "numeric" })).toBe("11");
  });

  it("does not let a caller override the zone back to UTC", () => {
    const text = watTime(JUST_AFTER_MIDNIGHT_WAT, { timeZone: "UTC" });
    expect(text.toLowerCase()).toBe("12:15 am");
  });

  it("counts days in Nigeria, so 00:15 WAT is today at 09:00 WAT, not yesterday", () => {
    // 09:00 WAT on 11 Sep is 08:00 UTC.
    expect(watDaysAgo(JUST_AFTER_MIDNIGHT_WAT, "2026-09-11T08:00:00Z")).toBe(0);
  });

  it("and calls the previous evening yesterday", () => {
    // 22:00 WAT on 10 Sep, viewed at 09:00 WAT on 11 Sep.
    expect(watDaysAgo("2026-09-10T21:00:00Z", "2026-09-11T08:00:00Z")).toBe(1);
  });

  it("reads the year in Nigeria at the new-year boundary", () => {
    // 00:30 WAT on 1 January 2027 is 23:30 UTC on 31 December 2026.
    expect(watYear("2026-12-31T23:30:00Z")).toBe(2027);
  });

  it("accepts a Date as well as a string", () => {
    expect(watDayKey(new Date(JUST_AFTER_MIDNIGHT_WAT))).toBe("2026-09-11");
  });
});
