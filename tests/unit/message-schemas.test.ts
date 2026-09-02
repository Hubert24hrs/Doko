import { describe, expect, it } from "vitest";

import {
  MESSAGE_MAX_LENGTH,
  editMessageSchema,
  messageIdSchema,
  openConversationSchema,
  sendMessageSchema,
} from "@/features/messages/schemas";

const CONVERSATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const MESSAGE_ID = "9c5b94b1-35ad-49bb-b118-8e8fc24abf80";
const USER_ID = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

describe("sendMessageSchema", () => {
  const base = { conversationId: CONVERSATION_ID, body: "Good morning" };

  it("accepts an ordinary message", () => {
    expect(sendMessageSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty or whitespace-only message", () => {
    for (const body of ["", "   ", "\n\n \t"]) {
      expect(sendMessageSchema.safeParse({ ...base, body }).success).toBe(false);
    }
  });

  it("trims surrounding whitespace rather than storing it", () => {
    expect(sendMessageSchema.parse({ ...base, body: "  hello  " }).body).toBe(
      "hello",
    );
  });

  it("keeps newlines inside the message", () => {
    // Only the ends are trimmed. A message written as several lines should
    // arrive as several lines.
    const body = "Line one\nLine two";
    expect(sendMessageSchema.parse({ ...base, body }).body).toBe(body);
  });

  it("accepts exactly the maximum length and rejects one character more", () => {
    // The bound mirrors the CHECK constraint on public.messages, so anything
    // the composer accepts can never be refused by the database.
    expect(
      sendMessageSchema.safeParse({
        ...base,
        body: "a".repeat(MESSAGE_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({
        ...base,
        body: "a".repeat(MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("measures the length after trimming, not before", () => {
    // Otherwise a message padded with spaces would be refused for being too
    // long and then stored well within the limit.
    expect(
      sendMessageSchema.safeParse({
        ...base,
        body: `  ${"a".repeat(MESSAGE_MAX_LENGTH)}  `,
      }).success,
    ).toBe(true);
  });

  it("rejects a conversation id that is not a uuid", () => {
    for (const conversationId of ["", "abc", "not-a-uuid"]) {
      expect(sendMessageSchema.safeParse({ ...base, conversationId }).success).toBe(
        false,
      );
    }
  });
});

describe("openConversationSchema", () => {
  it("accepts a member id", () => {
    expect(
      openConversationSchema.safeParse({ otherUserId: USER_ID }).success,
    ).toBe(true);
  });

  it("rejects anything that is not a member id", () => {
    for (const otherUserId of ["", "me", "0"]) {
      expect(openConversationSchema.safeParse({ otherUserId }).success).toBe(
        false,
      );
    }
  });

  it("does not decide who may be messaged", () => {
    // Deliberate: a well-formed id for somebody private still parses here and
    // is refused by can_message() in the database. Only one place decides,
    // and it is not this one.
    expect(
      openConversationSchema.safeParse({ otherUserId: USER_ID }).success,
    ).toBe(true);
  });
});

describe("editMessageSchema", () => {
  const base = {
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    body: "Corrected",
  };

  it("accepts an edit", () => {
    expect(editMessageSchema.safeParse(base).success).toBe(true);
  });

  it("refuses to empty a message, because withdrawing is a different act", () => {
    // Emptying would leave a blank bubble with no explanation. Withdrawal
    // blanks the body in the database AND records deleted_at, so the thread
    // can say what happened.
    expect(editMessageSchema.safeParse({ ...base, body: "   " }).success).toBe(
      false,
    );
  });

  it("applies the same length bound as sending", () => {
    expect(
      editMessageSchema.safeParse({
        ...base,
        body: "a".repeat(MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("requires both ids: one to find the message, one to revalidate the thread", () => {
    expect(
      editMessageSchema.safeParse({ ...base, messageId: "x" }).success,
    ).toBe(false);
    expect(
      editMessageSchema.safeParse({ ...base, conversationId: "x" }).success,
    ).toBe(false);
  });
});

describe("messageIdSchema", () => {
  it("accepts a message and its conversation", () => {
    expect(
      messageIdSchema.safeParse({
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
      }).success,
    ).toBe(true);
  });

  it("carries no body, because withdrawing is not an edit", () => {
    const parsed = messageIdSchema.parse({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      body: "sneaked in",
    });
    expect("body" in parsed).toBe(false);
  });
});
