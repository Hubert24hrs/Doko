"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  createGroupSchema,
  groupMembershipSchema,
  slugifyGroupName,
} from "./schemas";

export interface GroupActionState {
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

export async function createGroupAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const user = await requireUser("/groups");

  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    kind: formData.get("kind") ?? "interest",
    geoId: formData.get("geoId") ?? "",
    visibility: formData.get("visibility") ?? "public",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `group-create:${user.id}`,
    limit: 10,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: "You have created several groups today. Please try again tomorrow.",
    };
  }

  const supabase = await createClient();
  const base = slugifyGroupName(parsed.data.name) || "group";

  // Retry with a suffix rather than rejecting a perfectly good name because
  // somebody else used it first. Bounded, so a pathological case terminates.
  let created: { id: string; slug: string } | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;

    const { data, error } = await supabase
      .from("groups")
      .insert({
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        kind: parsed.data.kind,
        geo_id: parsed.data.geoId,
        visibility: parsed.data.visibility,
        created_by: user.id,
      })
      .select("id, slug");

    if (!error && data && data.length > 0) {
      created = data[0];
      break;
    }
    // 23505 is the slug already being taken; anything else is a real failure.
    if (error && error.code !== "23505") {
      lastError = error.message;
      break;
    }
  }

  if (!created) {
    console.error("[groups.create] failed", lastError);
    return { ok: false, formError: "That group could not be created. Please try again." };
  }

  revalidatePath("/groups");
  // The creator is made owner by trigger, so the group page is immediately
  // theirs to manage.
  redirect(`/groups/${created.slug}`);
}

/**
 * Join or leave a group.
 *
 * Sends the desired end state, as following does: a toggle read from stale UI
 * would do the opposite of what the member meant.
 */
export async function setMembershipAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const user = await requireUser("/groups");

  const parsed = groupMembershipSchema.safeParse({
    groupId: formData.get("groupId"),
    slug: formData.get("slug"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That request could not be understood." };
  }

  const { groupId, slug, intent } = parsed.data;

  const limit = await checkRateLimit({
    key: `group-membership:${user.id}`,
    limit: 100,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many changes in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();

  if (intent === "join") {
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: user.id });

    // 23505 means already a member, which is the desired end state.
    if (error && error.code !== "23505") {
      console.error("[groups.join] failed", error.message);
      if (error.code === "42501") {
        return {
          ok: false,
          formError: "This group cannot be joined. It may be private.",
        };
      }
      return { ok: false, formError: "You could not be added to this group." };
    }
  } else {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[groups.leave] failed", error.message);
      // The last-owner guard raises rather than filtering, so this is the one
      // membership change that fails loudly and deserves its own message.
      if (error.code === "23514") {
        return {
          ok: false,
          formError:
            "You are the only owner. Make somebody else an owner before leaving.",
        };
      }
      return { ok: false, formError: "You could not be removed from this group." };
    }
  }

  revalidatePath(`/groups/${slug}`);
  revalidatePath("/groups");
  return { ok: true, changedAt: new Date().toISOString() };
}
