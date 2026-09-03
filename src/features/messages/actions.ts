"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  editMessageSchema,
  messageIdSchema,
  openConversationSchema,
  openGroupConversationSchema,
  sendMessageSchema,
} from "./schemas";

export interface MessageState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  /** Changes on every successful send, so the client can clear its input. */
  sentAt?: string;
}

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Open (not create) a conversation with somebody, then go to it.
 *
 * The RPC is idempotent, so pressing "Message" on a profile you have written
 * to before lands in the existing conversation rather than starting a second
 * one. It is also the only path that exists: creating a conversation inserts a
 * membership row for the other person, which no policy can safely allow.
 */
export async function openConversationAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const user = await requireUser("/messages");

  const parsed = openConversationSchema.safeParse({
    otherUserId: formData.get("otherUserId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That member could not be found." };
  }

  const limit = await checkRateLimit({
    key: `conversation-open:${user.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `You have started several conversations in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_direct_conversation", {
    other_user_id: parsed.data.otherUserId,
  });

  if (error || !data) {
    console.error("[messages.open] failed", error?.message);
    // The function raises one error for "no such person", "they are private"
    // and "they are suspended" alike, so that pressing the button cannot be
    // used to find out which.
    return {
      ok: false,
      formError: "You cannot start a conversation with that member.",
    };
  }

  revalidatePath("/messages");
  redirect(`/messages/${data}`);
}

export async function sendMessageAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const user = await requireUser("/messages");

  const parsed = sendMessageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `message-send:${user.id}`,
    limit: 200,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `You have sent a great many messages in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: parsed.data.conversationId,
      author_id: user.id,
      body: parsed.data.body,
    })
    .select("id");

  if (error) {
    console.error("[messages.send] failed", error.message);
    if (error.code === "42501") {
      return {
        ok: false,
        formError: "You are not part of this conversation.",
      };
    }
    return { ok: false, formError: "Your message could not be sent." };
  }

  if (!data || data.length === 0) {
    return { ok: false, formError: "Your message could not be sent." };
  }

  revalidatePath(`/messages/${parsed.data.conversationId}`);
  revalidatePath("/messages");
  return { ok: true, sentAt: new Date().toISOString() };
}

/**
 * Move the caller's read marker to now.
 *
 * An UPSERT, not an update: in a group conversation the marker does not exist
 * until the member first reads. Group chats are not fanned out to every member
 * when they are created, precisely so that a group of five hundred does not
 * materialise five hundred rows nobody has looked at.
 *
 * The affected rows are counted because RLS refuses by FILTERING rather than
 * by raising. A silent zero would leave the unread badge permanently lit with
 * no error anywhere to explain it.
 */
export async function markConversationReadAction(
  conversationId: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser("/messages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversation_members")
    .upsert(
      {
        conversation_id: conversationId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" },
    )
    .select("conversation_id");

  if (error) {
    console.error("[messages.markRead] failed", error.message);
    return { ok: false };
  }
  if (!data || data.length === 0) {
    console.error("[messages.markRead] refused for", conversationId);
    return { ok: false };
  }

  revalidatePath("/messages");
  return { ok: true };
}

export async function editMessageAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireUser("/messages");

  const parsed = editMessageSchema.safeParse({
    messageId: formData.get("messageId"),
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.messageId)
    .select("id");

  if (error) {
    console.error("[messages.edit] failed", error.message);
    return { ok: false, formError: "That message could not be changed." };
  }
  // messages_update_own filters out anything the caller does not own, and a
  // withdrawn message is restored by the guard trigger, so zero rows here
  // means the edit was refused rather than that nothing needed changing.
  if (!data || data.length === 0) {
    return { ok: false, formError: "That message could not be changed." };
  }

  revalidatePath(`/messages/${parsed.data.conversationId}`);
  return { ok: true, sentAt: new Date().toISOString() };
}

/**
 * Withdraw a message.
 *
 * Soft, like a post or a comment: the row keeps its place in the thread so the
 * replies around it still make sense. The trigger blanks the body in the
 * database rather than the UI hiding it, so no cached payload and no realtime
 * event can still be carrying the words.
 */
export async function withdrawMessageAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireUser("/messages");

  const parsed = messageIdSchema.safeParse({
    messageId: formData.get("messageId"),
    conversationId: formData.get("conversationId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That message could not be withdrawn." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.messageId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[messages.withdraw] failed", error.message);
    return { ok: false, formError: "That message could not be withdrawn." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That message could not be withdrawn." };
  }

  revalidatePath(`/messages/${parsed.data.conversationId}`);
  revalidatePath("/messages");
  return { ok: true, sentAt: new Date().toISOString() };
}

/**
 * Open (or return to) a group's conversation.
 *
 * Idempotent like the direct one: a group has one chat, and pressing the
 * button asks to be in it rather than to make another. Membership is checked
 * in the database -- reading a public group does not entitle you to its
 * conversation, for the same reason it does not entitle you to post in it.
 */
export async function openGroupConversationAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const user = await requireUser("/groups");

  const parsed = openGroupConversationSchema.safeParse({
    groupId: formData.get("groupId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That group could not be found." };
  }

  const limit = await checkRateLimit({
    key: `conversation-open:${user.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `You have opened several conversations in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_group_conversation", {
    target_group_id: parsed.data.groupId,
  });

  if (error || !data) {
    console.error("[messages.openGroup] failed", error?.message);
    return {
      ok: false,
      formError: "You need to join this group before opening its conversation.",
    };
  }

  revalidatePath("/messages");
  redirect(`/messages/${data}`);
}
