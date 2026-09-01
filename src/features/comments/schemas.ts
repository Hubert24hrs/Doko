import { z } from "zod";

/** Mirrors the comments_body_length CHECK constraint. */
export const COMMENT_MAX_LENGTH = 2000;

export const reactionKinds = ["like", "celebrate", "support", "sad"] as const;
export type ReactionKindValue = (typeof reactionKinds)[number];

export const createCommentSchema = z.object({
  postId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write something before replying")
    .max(
      COMMENT_MAX_LENGTH,
      `A reply can be at most ${COMMENT_MAX_LENGTH.toLocaleString("en-NG")} characters`,
    ),
});

export const deleteCommentSchema = z.object({
  commentId: z.uuid(),
});

/**
 * Setting a reaction is a toggle: sending the kind you already have removes
 * it, and sending a different one replaces it. That keeps the one-per-person
 * unique constraint satisfied without the client needing to know its own
 * current state.
 */
export const setReactionSchema = z.object({
  postId: z.uuid(),
  kind: z.enum(reactionKinds),
});
