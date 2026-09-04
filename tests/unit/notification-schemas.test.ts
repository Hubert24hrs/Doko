import { describe, expect, it } from "vitest";

import { markReadSchema } from "@/features/notifications/schemas";

const VALID_NOTIF_ID = "8b5da2d1-7c92-4f32-bf72-8854acb32115";

describe("markReadSchema", () => {
  it("accepts valid uuid notification id", () => {
    const res = markReadSchema.safeParse({ notificationId: VALID_NOTIF_ID });
    expect(res.success).toBe(true);
  });

  it("rejects malformed notification id", () => {
    const res = markReadSchema.safeParse({ notificationId: "abc-123" });
    expect(res.success).toBe(false);
  });

  it("rejects missing notification id", () => {
    const res = markReadSchema.safeParse({});
    expect(res.success).toBe(false);
  });
});
