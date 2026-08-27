import { describe, expect, it } from "vitest";

import { publicEnvSchema } from "@/lib/env";

/**
 * `getClientEnv` / `tryGetClientEnv` memoise their result, so they cannot be
 * meaningfully exercised more than once per process. The schema they are built
 * on is the part with real rules, so that is what is tested here.
 */
describe("publicEnvSchema", () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "some-anon-key",
    NEXT_PUBLIC_SITE_URL: "https://ezikeoba.example",
  };

  it("accepts a complete configuration", () => {
    expect(publicEnvSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults the site URL for local development", () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    }
  });

  it("rejects a missing Supabase URL", () => {
    expect(
      publicEnvSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SITE_URL: valid.NEXT_PUBLIC_SITE_URL,
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed Supabase URL", () => {
    expect(
      publicEnvSchema.safeParse({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty anon key", () => {
    expect(
      publicEnvSchema.safeParse({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })
        .success,
    ).toBe(false);
  });

  it("reports every problem at once, not just the first", () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "nope",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
