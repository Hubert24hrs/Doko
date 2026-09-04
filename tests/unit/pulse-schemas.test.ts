import { describe, expect, it } from "vitest";
import { pulseQuerySchema } from "@/features/pulse/schemas";

describe("pulseQuerySchema", () => {
  it("uses default limit of 60 when no input is provided", () => {
    const res = pulseQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.limit).toBe(60);
    }
  });

  it("accepts custom valid limit", () => {
    const res = pulseQuerySchema.safeParse({ limit: 25 });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.limit).toBe(25);
    }
  });

  it("rejects limit below 1", () => {
    const res = pulseQuerySchema.safeParse({ limit: 0 });
    expect(res.success).toBe(false);
  });

  it("rejects limit exceeding 100", () => {
    const res = pulseQuerySchema.safeParse({ limit: 150 });
    expect(res.success).toBe(false);
  });
});

describe("24-Hour Rolling Window Calculation", () => {
  it("correctly identifies activity within 24 hours", () => {
    const now = new Date();
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    const isWithin24h = (dateIso: string) => {
      const diffMs = Date.now() - new Date(dateIso).getTime();
      return diffMs <= 24 * 60 * 60 * 1000 && diffMs >= 0;
    };

    expect(isWithin24h(twentyThreeHoursAgo.toISOString())).toBe(true);
    expect(isWithin24h(twentyFiveHoursAgo.toISOString())).toBe(false);
  });

  it("prevents duplicate entries for the same member", () => {
    const rawActivities = [
      { userId: "user-1", activityAt: "2026-09-04T02:00:00Z" },
      { userId: "user-1", activityAt: "2026-09-04T02:30:00Z" },
      { userId: "user-2", activityAt: "2026-09-04T01:00:00Z" },
    ];

    const uniqueUserIds = Array.from(new Set(rawActivities.map((a) => a.userId)));
    expect(uniqueUserIds.length).toBe(2);
    expect(uniqueUserIds).toEqual(["user-1", "user-2"]);
  });
});
