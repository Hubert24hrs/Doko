import { z } from "zod";
import { issueStatuses } from "@/features/issues/schemas";

export const toggleVerificationSchema = z.object({
  memberId: z.uuid("Invalid member id"),
  intent: z.enum(["verify", "unverify"]),
  tier: z.enum(["blue", "gold"]).optional(),
});

export const toggleSuspensionSchema = z.object({
  memberId: z.uuid("Invalid member id"),
  intent: z.enum(["suspend", "reinstate"]),
  reason: z.string().trim().max(500).optional(),
});

export const toggleVerificationDelegateSchema = z.object({
  memberId: z.uuid("Invalid member id"),
  intent: z.enum(["delegate", "revoke"]),
  notes: z.string().trim().max(500).optional(),
});

export const reviewVerificationRequestSchema = z.object({
  requestId: z.uuid("Invalid request id"),
  decision: z.enum(["approve", "reject"]),
  tier: z.enum(["blue", "gold"]).optional(),
  reviewNotes: z.string().trim().max(1000).optional(),
});

export const adminIssueStatusSchema = z.object({
  issueId: z.uuid("Invalid issue id"),
  status: z.enum(issueStatuses),
  note: z.string().trim().max(1000).optional(),
});
