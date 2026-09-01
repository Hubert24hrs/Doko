import { z } from "zod";

/**
 * Post validation (zod v4).
 *
 * Mirrors the database CHECK constraints exactly, so a member sees a useful
 * message rather than a constraint violation. The database remains the
 * authority; this is the courtesy layer in front of it.
 */

export const POST_MAX_LENGTH = 5000;

/**
 * Three tiers. `followers` was deliberately absent until following existed,
 * because a visibility nobody could satisfy would have been a trap.
 */
export const postVisibilityValues = [
  "public",
  "community",
  "followers",
] as const;

/** Empty optional select values arrive as "" and mean "not chosen". */
const optionalUuid = z
  .union([z.literal(""), z.uuid("Choose a valid community")])
  .transform((v) => (v === "" ? null : v));

export const createPostSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before posting")
    .max(
      POST_MAX_LENGTH,
      `A post can be at most ${POST_MAX_LENGTH.toLocaleString("en-NG")} characters`,
    ),

  /** NULL scopes the post to the whole LGA, which is the default. */
  geoId: optionalUuid,

  visibility: z.enum(postVisibilityValues),
});

export type CreatePostInput = z.input<typeof createPostSchema>;

export const updatePostSchema = z.object({
  postId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "A post cannot be empty")
    .max(POST_MAX_LENGTH, `A post can be at most ${POST_MAX_LENGTH} characters`),
});

export const deletePostSchema = z.object({
  postId: z.uuid(),
});
