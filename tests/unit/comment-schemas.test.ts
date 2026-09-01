import { describe, expect, it } from "vitest";

import {
  COMMENT_MAX_LENGTH,
  createCommentSchema,
  setReactionSchema,
} from "@/features/comments/schemas";

// Ids must be conforming UUIDs: zod v4 enforces the RFC 4122 version and
// variant bits, and every id the app handles comes from gen_random_uuid().
const POST_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("createCommentSchema", () => {
  it("accepts a normal reply", () => {
    expect(
      createCommentSchema.safeParse({ postId: POST_ID, body: "Well said." })
        .success,
    ).toBe(true);
  });

  it("rejects an empty or whitespace-only reply", () => {
    for (const body of ["", "   ", "\n\t "]) {
      expect(createCommentSchema.safeParse({ postId: POST_ID, body }).success).toBe(
        false,
      );
    }
  });

  it("trims surrounding whitespace", () => {
    expect(
      createCommentSchema.parse({ postId: POST_ID, body: "  hello  " }).body,
    ).toBe("hello");
  });

  it("accepts exactly the maximum length and rejects one more", () => {
    expect(
      createCommentSchema.safeParse({
        postId: POST_ID,
        body: "a".repeat(COMMENT_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      createCommentSchema.safeParse({
        postId: POST_ID,
        body: "a".repeat(COMMENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("allows a shorter maximum than a post", () => {
    // Replies are capped at 2,000 where posts allow 5,000. A reply that runs
    // longer than the thing it replies to is usually its own post.
    expect(COMMENT_MAX_LENGTH).toBeLessThan(5000);
  });

  it("requires a valid post id", () => {
    expect(
      createCommentSchema.safeParse({ postId: "nope", body: "hi" }).success,
    ).toBe(false);
  });

  it("does not accept an author id from the client", () => {
    const result = createCommentSchema.parse({
      postId: POST_ID,
      body: "hi",
      authorId: POST_ID,
    } as never);
    expect(result).not.toHaveProperty("authorId");
  });
});

describe("setReactionSchema", () => {
  it("accepts each of the four community reactions", () => {
    for (const kind of ["like", "celebrate", "support", "sad"]) {
      expect(setReactionSchema.safeParse({ postId: POST_ID, kind }).success).toBe(
        true,
      );
    }
  });

  it("rejects anything outside that set", () => {
    // The enum exists in the database too; an unknown kind must fail here so
    // the member never reaches a constraint violation.
    for (const kind of ["angry", "haha", "wow", "", "LIKE"]) {
      expect(setReactionSchema.safeParse({ postId: POST_ID, kind }).success).toBe(
        false,
      );
    }
  });

  it("requires a valid post id", () => {
    expect(
      setReactionSchema.safeParse({ postId: "nope", kind: "like" }).success,
    ).toBe(false);
  });
});
