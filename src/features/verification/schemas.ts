import { z } from "zod";

export const verificationRequestSchema = z.object({
  tier: z.enum(["blue", "gold"]),
  organization: z
    .string()
    .max(120, "Organization name must not exceed 120 characters.")
    .optional()
    .transform((val) => (val?.trim() ? val.trim() : undefined)),
  roleTitle: z
    .string()
    .max(120, "Role/Title must not exceed 120 characters.")
    .optional()
    .transform((val) => (val?.trim() ? val.trim() : undefined)),
  notes: z
    .string()
    .max(1000, "Notes must not exceed 1000 characters.")
    .optional()
    .transform((val) => (val?.trim() ? val.trim() : undefined)),
});

export type VerificationRequestInput = z.infer<typeof verificationRequestSchema>;
