import { describe, expect, it } from "vitest";

import {
  toggleVerificationSchema,
  toggleSuspensionSchema,
  adminIssueStatusSchema,
} from "@/features/admin/schemas";

const VALID_MEMBER_ID = "8b5da2d1-7c92-4f32-bf72-8854acb32115";
const VALID_ISSUE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("toggleVerificationSchema", () => {
  it("accepts valid verify intent", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "verify",
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

  it("rejects invalid intent", () => {
    const res = toggleVerificationSchema.safeParse({
      memberId: VALID_MEMBER_ID,
      intent: "something_else",
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
