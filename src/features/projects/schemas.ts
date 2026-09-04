import { z } from "zod";

export const projectCategoryEnum = z.enum([
  "road",
  "water_borehole",
  "electricity_solar",
  "school_education",
  "health_center",
  "security",
  "culture",
]);

export const projectStatusEnum = z.enum([
  "pending_review",
  "active",
  "completed",
  "paused",
  "rejected",
]);

export const createProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(140, "Title cannot exceed 140 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description cannot exceed 2,000 characters"),
  category: projectCategoryEnum.default("road"),
  target_village_id: z.string().uuid("Invalid village ID").optional().or(z.literal("")),
  target_amount_naira: z
    .number()
    .int("Amount must be in whole Naira")
    .min(10000, "Target funding must be at least ₦10,000")
    .max(100000000, "Target funding cannot exceed ₦100,000,000"),
  image_url: z
    .string()
    .trim()
    .url("Image must be a valid web URL")
    .optional()
    .or(z.literal("")),
});

export const donateProjectSchema = z.object({
  project_id: z.string().uuid("Invalid project ID"),
  amount_naira: z
    .number()
    .int("Amount must be in whole Naira")
    .min(500, "Minimum donation amount is ₦500")
    .max(5000000, "Maximum single donation is ₦5,000,000"),
  donor_name: z.string().trim().max(80).optional(),
  is_anonymous: z.boolean().default(false),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type DonateProjectInput = z.infer<typeof donateProjectSchema>;