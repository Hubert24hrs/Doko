"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { markReadSchema } from "./schemas";

export interface NotificationState {
  ok: boolean;
  formError?: string;
}

export async function markNotificationReadAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  const user = await requireUser("/notifications");

  const parsed = markReadSchema.safeParse({
    notificationId: formData.get("notificationId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid notification." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications.markRead] failed", error.message);
    return { ok: false, formError: "Could not update notification." };
  }

  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<NotificationState> {
  const user = await requireUser("/notifications");

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications.markAllRead] failed", error.message);
    return { ok: false, formError: "Could not mark notifications as read." };
  }

  revalidatePath("/notifications");
  return { ok: true };
}
