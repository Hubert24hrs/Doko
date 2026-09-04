import { z } from "zod";

export const adPlacementEnum = z.enum(["feed_sponsored", "marketplace_banner", "community_sidebar"]);
export const adStatusEnum = z.enum(["pending", "approved", "rejected", "active", "paused", "completed"]);

export const adCampaignSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title cannot exceed 120 characters"),
  description: z
    .string()
    .trim()
    .min(5, "Description must be at least 5 characters")
    .max(500, "Description cannot exceed 500 characters"),
  target_url: z
    .string()
    .trim()
    .url("Target URL must be a valid HTTP/HTTPS web address or WhatsApp link")
    .optional()
    .or(z.literal("")),
  image_url: z
    .string()
    .trim()
    .url("Image URL must be a valid image web address")
    .optional()
    .or(z.literal("")),
  placement: adPlacementEnum.default("feed_sponsored"),
  target_village_id: z.string().uuid("Invalid village selection").optional().or(z.literal("")),
  budget_naira: z
    .number()
    .int("Budget must be a whole number")
    .min(0, "Budget cannot be negative")
    .default(0),
  duration_days: z
    .number()
    .int("Duration must be in whole days")
    .min(1, "Duration must be at least 1 day")
    .max(90, "Duration cannot exceed 90 days")
    .default(30),
});

export const adModerationSchema = z.object({
  ad_id: z.string().uuid("Invalid advertisement ID"),
  status: z.enum(["approved", "rejected", "active", "paused", "completed"]),
  rejection_reason: z
    .string()
    .trim()
    .max(250, "Rejection reason cannot exceed 250 characters")
    .optional(),
});

export const adQuerySchema = z.object({
  placement: adPlacementEnum.default("feed_sponsored"),
  limit: z.number().int().min(1).max(20).default(5),
});

export type AdCampaignInput = z.infer<typeof adCampaignSchema>;
export type AdModerationInput = z.infer<typeof adModerationSchema>;
