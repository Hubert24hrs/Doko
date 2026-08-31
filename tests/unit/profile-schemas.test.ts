import { describe, expect, it } from "vitest";

import { updateProfileSchema } from "@/features/profile/schemas";

/**
 * A valid baseline. Each test overrides one field so a failure points at the
 * rule under test rather than at incidental fixture drift.
 */
const base = {
  fullName: "Chidera Eze",
  username: "chidera_eze",
  bio: "",
  occupation: "",
  website: "",
  phone: "",
  villageId: "",
  visibility: "public" as const,
};

describe("updateProfileSchema", () => {
  it("accepts a minimal profile with every optional field blank", () => {
    const result = updateProfileSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("normalises blank optional fields to null, not empty strings", () => {
    const result = updateProfileSchema.parse(base);
    // Empty strings would defeat `is null` filters and write "" into columns
    // whose absence is meaningful.
    expect(result.bio).toBeNull();
    expect(result.occupation).toBeNull();
    expect(result.website).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.villageId).toBeNull();
  });

  it("treats an unset village as 'prefer not to say' rather than an error", () => {
    const result = updateProfileSchema.safeParse({ ...base, villageId: "" });
    expect(result.success).toBe(true);
    expect(result.data?.villageId).toBeNull();
  });

  it("rejects a village id that is not a uuid", () => {
    const result = updateProfileSchema.safeParse({
      ...base,
      villageId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("normalises a Nigerian phone number to E.164", () => {
    const result = updateProfileSchema.parse({ ...base, phone: "08031234567" });
    expect(result.phone).toBe("+2348031234567");
  });

  it("rejects a website that is not http(s)", () => {
    // The database CHECK constraint enforces this too; the schema exists so the
    // member sees a message instead of a constraint violation.
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "ftp://example.com",
      "example.com",
    ]) {
      const result = updateProfileSchema.safeParse({ ...base, website: url });
      expect(result.success, `${url} must be rejected`).toBe(false);
    }
  });

  it("accepts a well-formed https website", () => {
    const result = updateProfileSchema.parse({
      ...base,
      website: "https://ezikeoba.ng",
    });
    expect(result.website).toBe("https://ezikeoba.ng");
  });

  it("rejects a bio longer than 500 characters", () => {
    const result = updateProfileSchema.safeParse({
      ...base,
      bio: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a bio of exactly 500 characters", () => {
    const result = updateProfileSchema.safeParse({
      ...base,
      bio: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("enforces the same username rules as registration", () => {
    for (const username of ["ab", "Has Capitals", "has-hyphen", "admin"]) {
      const result = updateProfileSchema.safeParse({ ...base, username });
      expect(result.success, `${username} must be rejected`).toBe(false);
    }
  });

  it("only accepts the three known visibility values", () => {
    for (const visibility of ["public", "community", "private"]) {
      expect(
        updateProfileSchema.safeParse({ ...base, visibility }).success,
      ).toBe(true);
    }
    expect(
      updateProfileSchema.safeParse({ ...base, visibility: "everyone" }).success,
    ).toBe(false);
  });

  it("exposes no privileged field, so a crafted request cannot set one", () => {
    const result = updateProfileSchema.parse({
      ...base,
      is_verified: true,
      is_suspended: false,
      deleted_at: null,
    } as never);

    // zod strips unknown keys; the guard trigger is the real defence, but the
    // schema must not carry them through in the first place.
    expect(result).not.toHaveProperty("is_verified");
    expect(result).not.toHaveProperty("is_suspended");
    expect(result).not.toHaveProperty("deleted_at");
  });
});
