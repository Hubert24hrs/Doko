import { describe, expect, it } from "vitest";

import {
  toggleVerificationSchema,
  toggleSuspensionSchema,
  toggleVerificationDelegateSchema,
  reviewVerificationRequestSchema,
  adminIssueStatusSchema,
} from "@/features/admin/schemas";

const VALID_MEMBER_ID = "8b5da2d1-7c92-4f32-bf72-8854acb32115";
const VALID_ISSUE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const VALID_REQUEST_ID = "5e81d77a-268e-4a6c-905e-8b63e8a4a580";

describe("toggleVerificationSchema", () => {
  it("accepts valid verify intent with gold tier", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "verify",
      tier: "gold",
    });
    expect(res.success).toBe(true);
  });

  it("accepts valid verify intent with blue tier", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "verify",
      tier: "blue",
    });
    expect(res.success).toBe(true);
  });

  it("accepts valid unverify intent", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "unverify",
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid member id", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: "not-a-uuid",
      intent: "verify",
    });
    expect(res.success).toBe(false);
  });

  it("rejects invalid tier", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "verify",
      tier: "platinum",
    });
    expect(res.success).toBe(false);
  });
});

describe("toggleVerificationDelegateSchema", () => {
  it("accepts valid delegate intent with notes", () => {
    const res = toggleVerificationDelegateSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "delegate",
      notes: "Appointed moderator for Enugu-Ezike North zone.",
    });
    expect(res.success).toBe(true);
  });

  it("accepts valid revoke intent", () => {
    const res = toggleVerificationDelegateSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "revoke",
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid intent", () => {
    const res = toggleVerificationDelegateSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "promote",
    });
    expect(res.success).toBe(false);
  });
});

describe("reviewVerificationRequestSchema", () => {
  it("accepts valid approve decision with gold tier", () => {
    const res = reviewVerificationRequestSchema.safeParse({
      requestId: VALID_REQUEST_ID,
      decision: "approve",
      tier: "gold",
      reviewNotes: "Credentials verified with traditional council.",
    });
    expect(res.success).toBe(true);
  });

  it("accepts valid reject decision", () => {
    const res = reviewVerificationRequestSchema.safeParse({
      requestId: VALID_REQUEST_ID,
      decision: "reject",
      reviewNotes: "Insufficient community standing documentation.",
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid decision", () => {
    const res = reviewVerificationRequestSchema.safeParse({
      requestId: VALID_REQUEST_ID,
      decision: "hold",
    });
    expect(res.success).toBe(false);
  });
});

describe("toggleSuspensionSchema", () => {
  it("accepts suspend intent with reason", () => {
    const res = toggleSuspensionSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "suspend",
      reason: "Repeated spam in marketplace",
    });
    expect(res.success).toBe(true);
  });

  it("accepts reinstate intent without reason", () => {
    const res = toggleSuspensionSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "reinstate",
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid intent", () => {
    const res = toggleSuspensionSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "ban",
    });
    expect(res.success).toBe(false);
  });
});

describe("adminIssueStatusSchema", () => {
  it("accepts valid issue status update with note", () => {
    const res = adminIssueStatusSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      status: "in_progress",
      note: "Contractor mobilized by LGA works department.",
    });
    expect(res.success).toBe(true);
  });

  it("rejects unknown status", () => {
    const res = adminIssueStatusSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      status: "closed_permanently",
    });
    expect(res.success).toBe(false);
  });
});
