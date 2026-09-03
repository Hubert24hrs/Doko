"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  cancelEventSchema,
  createEventSchema,
  rsvpSchema,
  watLocalToInstant,
} from "./schemas";

export interface EventState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  changedAt?: string;
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

export async function createEventAction(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  const user = await requireUser("/events");

  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    venue: formData.get("venue") ?? "",
    kind: formData.get("kind") ?? "other",
    geoId: formData.get("geoId") ?? "",
    visibility: formData.get("visibility") ?? "public",
    startsAtLocal: formData.get("startsAtLocal") ?? "",
    endsAtLocal: formData.get("endsAtLocal") ?? "",
    isAllDay: formData.get("isAllDay") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `event-create:${user.id}`,
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: "You have created several events today. Please try again tomorrow.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      venue: parsed.data.venue,
      kind: parsed.data.kind,
      geo_id: parsed.data.geoId,
      visibility: parsed.data.visibility,
      is_all_day: parsed.data.isAllDay,
      organizer_id: user.id,
      // Both are converted from WAT local time here, once. Sending the raw
      // "2026-09-12T16:00" would let Postgres read it in whatever zone the
      // connection happened to have.
      starts_at: watLocalToInstant(parsed.data.startsAtLocal).toISOString(),
      // Left null deliberately when not given: the fill trigger sets it to the
      // end of the event's own day, and doing it here would be a second copy
      // of that rule.
      ends_at: parsed.data.endsAtLocal
        ? watLocalToInstant(parsed.data.endsAtLocal).toISOString()
        : undefined,
    })
    .select("id");

  if (error) {
    console.error("[events.create] failed", error.message);
    return { ok: false, formError: "That event could not be created." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That event could not be created." };
  }

  revalidatePath("/events");
  redirect(`/events/${data[0].id}`);
}

/**
 * Answer, or withdraw an answer.
 *
 * Sends the desired END STATE rather than toggling, as following and group
 * membership do: a toggle read from stale UI does the opposite of what the
 * member meant.
 *
 * 'withdraw' hard-deletes rather than storing a fourth status. An RSVP is a
 * current intention, not speech -- a tombstone would misstate who is coming,
 * which is the one question this table exists to answer. Same reasoning as
 * unfollowing and as withdrawing a reaction.
 */
export async function setRsvpAction(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  const user = await requireUser("/events");

  const parsed = rsvpSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That reply could not be understood." };
  }

  const limit = await checkRateLimit({
    key: `event-rsvp:${user.id}`,
    limit: 200,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many changes in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();

  if (parsed.data.status === "withdraw") {
    const { error } = await supabase
      .from("event_attendees")
      .delete()
      .eq("event_id", parsed.data.eventId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[events.rsvp.withdraw] failed", error.message);
      return { ok: false, formError: "Your reply could not be withdrawn." };
    }
  } else {
    const { data, error } = await supabase
      .from("event_attendees")
      .upsert(
        {
          event_id: parsed.data.eventId,
          user_id: user.id,
          status: parsed.data.status,
        },
        { onConflict: "event_id,user_id" },
      )
      .select("event_id");

    if (error) {
      console.error("[events.rsvp] failed", error.message);
      if (error.code === "42501") {
        return { ok: false, formError: "You cannot reply to this event." };
      }
      return { ok: false, formError: "Your reply could not be saved." };
    }
    // RLS refuses an upsert's UPDATE branch by filtering, so zero rows is a
    // refusal rather than a no-op.
    if (!data || data.length === 0) {
      return { ok: false, formError: "Your reply could not be saved." };
    }
  }

  revalidatePath(`/events/${parsed.data.eventId}`);
  revalidatePath("/events");
  return { ok: true, changedAt: new Date().toISOString() };
}

/**
 * Cancel an event.
 *
 * Cancelled, never quietly removed. People arrange their day around a funeral
 * or a meeting; an event that simply vanished would leave them turning up. The
 * row stays, says it is cancelled, and can say why.
 */
export async function cancelEventAction(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  await requireUser("/events");

  const parsed = cancelEventSchema.safeParse({
    eventId: formData.get("eventId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.eventId)
    .is("cancelled_at", null)
    .select("id");

  if (error) {
    console.error("[events.cancel] failed", error.message);
    return { ok: false, formError: "That event could not be cancelled." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That event could not be cancelled." };
  }

  revalidatePath(`/events/${parsed.data.eventId}`);
  revalidatePath("/events");
  return { ok: true, changedAt: new Date().toISOString() };
}

/** Remove an event entirely. Soft, as posts and comments are. */
export async function deleteEventAction(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  await requireUser("/events");

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) {
    return { ok: false, formError: "That event could not be removed." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[events.delete] failed", error.message);
    return { ok: false, formError: "That event could not be removed." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That event could not be removed." };
  }

  revalidatePath("/events");
  redirect("/events");
}
