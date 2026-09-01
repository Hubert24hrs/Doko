import { describe, expect, it } from "vitest";

import {
  POST_MAX_LENGTH,
  createPostSchema,
  updatePostSchema,
} from "@/features/posts/schemas";

const base = {
  body: "The new yam festival is this weekend at the village square.",
  geoId: "",
  visibility: "public" as const,
};

describe("createPostSchema", () => {
  it("accepts a normal post with no community chosen", () => {
    const result = createPostSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("treats an unchosen community as the whole LGA, not an error", () => {
    // Village affiliation is optional by product rule, so a member who never
    // chose one must still be able to post.
    const result = createPostSchema.parse(base);
    expect(result.geoId).toBeNull();
  });

  it("rejects an empty or whitespace-only body", () => {
    for (const body of ["", "   ", "\n\n  \t"]) {
      expect(createPostSchema.safeParse({ ...base, body }).success).toBe(false);
    }
  });

  it("trims surrounding whitespace rather than storing it", () => {
    const result = createPostSchema.parse({ ...base, body: "  hello  " });
    expect(result.body).toBe("hello");
  });

  it("accepts a body of exactly the maximum length", () => {
    const result = createPostSchema.safeParse({
      ...base,
      body: "a".repeat(POST_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a body one character over the maximum", () => {
    // Matches the posts_body_length CHECK constraint, so the member gets a
    // message instead of a constraint violation.
    const result = createPostSchema.safeParse({
      ...base,
      body: "a".repeat(POST_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a community id that is not a uuid", () => {
    expect(
      createPostSchema.safeParse({ ...base, geoId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("accepts all three known visibility values", () => {
    // 'followers' was withheld until following existed, because a visibility
    // nobody could satisfy would have been a trap. It exists now.
    for (const visibility of ["public", "community", "followers"]) {
      expect(
        createPostSchema.safeParse({ ...base, visibility }).success,
        visibility,
      ).toBe(true);
    }
  });

  it("still rejects anything outside that set", () => {
    // The enum exists in the database too, so an unknown value must fail here
    // rather than reaching a constraint violation.
    for (const visibility of ["private", "friends", "PUBLIC", ""]) {
      expect(
        createPostSchema.safeParse({ ...base, visibility }).success,
        visibility,
      ).toBe(false);
    }
  });

  it("does not accept an author id from the client", () => {
    const result = createPostSchema.parse({
      ...base,
      authorId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    } as never);
    // Authorship comes from the session and is enforced again by the INSERT
    // policy (author_id = auth.uid()); it must never be caller-supplied.
    expect(result).not.toHaveProperty("authorId");
  });

  it("keeps newlines inside the body intact", () => {
    const body = "Line one\nLine two\n\nLine four";
    expect(createPostSchema.parse({ ...base, body }).body).toBe(body);
  });
});

/**
 * Note on the ids below: zod v4's z.uuid() enforces the RFC 4122 version and
 * variant bits, so a placeholder like "1111...-1111" is rejected. Every id the
 * application actually handles comes from gen_random_uuid(), which is a
 * conforming v4, so the strictness is correct -- the fixtures have to be real
 * UUIDs rather than UUID-shaped strings.
 */
describe("updatePostSchema", () => {
  it("requires a valid post id", () => {
    expect(
      updatePostSchema.safeParse({ postId: "nope", body: "edited" }).success,
    ).toBe(false);
  });

  it("accepts an edit with a valid id and body", () => {
    const result = updatePostSchema.safeParse({
      postId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      body: "Corrected: the festival is on Saturday.",
    });
    expect(result.success).toBe(true);
  });

  it("will not let an edit blank a post", () => {
    expect(
      updatePostSchema.safeParse({
        postId: "0f8fad5b-d9cb-469f-a165-70867728950e",
        body: "   ",
      }).success,
    ).toBe(false);
  });
});
