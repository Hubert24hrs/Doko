import { z } from "zod";

/** Mirrors the CHECK constraint on public.messages. */
export const MESSAGE_MAX_LENGTH = 4000;

export const sendMessageSchema = z.object({
  conversationId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write something before sending")
    .max(
      MESSAGE_MAX_LENGTH,
      `A message can be at most ${MESSAGE_MAX_LENGTH.toLocaleString("en-NG")} characters`,
    ),
});

export const openConversationSchema = z.object({
  /** The person to talk to. The database decides whether that is allowed. */
  otherUserId: z.uuid(),
});

export const messageIdSchema = z.object({
  messageId: z.uuid(),
  conversationId: z.uuid(),
});

export const editMessageSchema = messageIdSchema.extend({
  body: z
    .string()
    .trim()
    .min(1, "A message cannot be emptied. Withdraw it instead.")
    .max(
      MESSAGE_MAX_LENGTH,
      `A message can be at most ${MESSAGE_MAX_LENGTH.toLocaleString("en-NG")} characters`,
    ),
});
