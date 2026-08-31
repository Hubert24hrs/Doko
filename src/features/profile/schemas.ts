import { z } from "zod";

import { phoneSchema, usernameSchema } from "@/features/auth/schemas";

/**
 * Profile editing (zod v4).
 *
 * Deliberately contains no privileged fields. `is_verified`, `is_suspended`
 * and friends are not merely absent from this schema — the
 * `profiles_guard_privileged` trigger restores them from the previous row for
 * any non-admin, so even a hand-crafted request cannot change them.
 */

/** An untouched optional input arrives as "", which means "not provided". */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal(""), schema]).transform((v) => (v === "" ? null : v));

export const profileVisibilityValues = [
  "public",
  "community",
  "private",
] as const;

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(120, "Name is too long"),

  username: usernameSchema,

  bio: optionalText(
    z.string().trim().max(500, "Bio must be 500 characters or fewer"),
  ),

  occupation: optionalText(
    z.string().trim().max(120, "Occupation is too long"),
  ),

  // The database CHECK constraint only accepts http(s); reject anything else
  // here so the member gets a real message instead of a constraint violation.
  website: optionalText(
    z
      .string()
      .trim()
      .refine(
        (v) => /^https?:\/\//i.test(v),
        "Website must start with http:// or https://",
      )
      .pipe(z.url("Enter a valid website URL")),
  ),

  phone: optionalText(phoneSchema),

  /** Empty string means "Prefer not to say" — village is optional by design. */
  villageId: optionalText(z.uuid("Select a valid village")),

  visibility: z.enum(profileVisibilityValues),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileParsed = z.output<typeof updateProfileSchema>;
