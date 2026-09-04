import { describe, expect, it } from "vitest";

import { verificationRequestSchema } from "@/features/verification/schemas";

describe("verificationRequestSchema", () => {
  it("accepts valid golden tier application with full details", () => {
    const res = verificationRequestSchema.safeParse({
      tier: "gold",
      organization: "Enugu-Ezike Traditional Rulers Council",
      roleTitle: "Council Secretary",
      notes: "Serving the traditional council for over 10 years.",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.tier).toBe("gold");
      expect(res.data.organization).toBe("Enugu-Ezike Traditional Rulers Council");
      expect(res.data.roleTitle).toBe("Council Secretary");
    }
  });

  it("accepts valid blue tier application with minimal details", () => {
    const res = verificationRequestSchema.safeParse({
      tier: "blue",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.tier).toBe("blue");
      expect(res.data.organization).toBeUndefined();
      expect(res.data.roleTitle).toBeUndefined();
      expect(res.data.notes).toBeUndefined();
    }
  });

  it("trims whitespace-only fields to undefined", () => {
    const res = verificationRequestSchema.safeParse({
      tier: "blue",
      organization: "   ",
      roleTitle: "  ",
      notes: "   ",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.organization).toBeUndefined();
      expect(res.data.roleTitle).toBeUndefined();
      expect(res.data.notes).toBeUndefined();
    }
  });

  it("rejects invalid tier", () => {
    const res = verificationRequestSchema.safeParse({
      tier: "diamond",
    });
    expect(res.success).toBe(false);
  });

  it("rejects excessively long organization name", () => {
    const res = verificationRequestSchema.safeParse({
      tier: "gold",
      organization: "A".repeat(121),
    });
    expect(res.success).toBe(false);
  });

  it("rejects excessively long notes", () => {
    const res = verificationRequestSchema.safeParse({
      tier: "gold",
      notes: "A".repeat(1001),
    });
    expect(res.success).toBe(false);
  });
});
