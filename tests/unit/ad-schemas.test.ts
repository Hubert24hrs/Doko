import { describe, it, expect } from "vitest";
import { adCampaignSchema, adModerationSchema, adQuerySchema } from "@/features/ads/schemas";

describe("Ad Campaign Schemas", () => {
  it("validates a complete ad campaign input", () => {
    const valid = adCampaignSchema.safeParse({
      title: "Umuogbo Agu Organic Honey",
      description: "Pure natural honey harvested from local Igbo-Eze North bee farms.",
      target_url: "https://doko-delta.vercel.app/marketplace",
      image_url: "https://images.unsplash.com/photo-1587049352847-4a222e784d38",
      placement: "feed_sponsored",
      budget_naira: 5000,
      duration_days: 14,
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.title).toBe("Umuogbo Agu Organic Honey");
      expect(valid.data.placement).toBe("feed_sponsored");
      expect(valid.data.duration_days).toBe(14);
    }
  });

  it("rejects invalid titles that are too short", () => {
    const res = adCampaignSchema.safeParse({
      title: "Hi",
      description: "Valid description longer than 5 chars",
    });

    expect(res.success).toBe(false);
  });

  it("rejects invalid URLs for target_url", () => {
    const res = adCampaignSchema.safeParse({
      title: "Valid Title",
      description: "Valid description text for local business",
      target_url: "not-a-valid-url",
    });

    expect(res.success).toBe(false);
  });

  it("validates ad moderation schema status transitions", () => {
    const valid = adModerationSchema.safeParse({
      ad_id: "123e4567-e89b-12d3-a456-426614174000",
      status: "approved",
    });

    expect(valid.success).toBe(true);
  });

  it("rejects invalid ad moderation status values", () => {
    const invalid = adModerationSchema.safeParse({
      ad_id: "123e4567-e89b-12d3-a456-426614174000",
      status: "unknown_status",
    });

    expect(invalid.success).toBe(false);
  });

  it("validates ad query default parameters", () => {
    const res = adQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.placement).toBe("feed_sponsored");
      expect(res.data.limit).toBe(5);
    }
  });
});
