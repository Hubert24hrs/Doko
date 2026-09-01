"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";

import { updateProfileSchema } from "./schemas";

export interface ProfileActionState {
  ok: boolean;
  message?: string;
  formError?: string;
  fieldErrors?: Record<string, string>;
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

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireUser("/settings");

  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    bio: formData.get("bio") ?? "",
    occupation: formData.get("occupation") ?? "",
    website: formData.get("website") ?? "",
    phone: formData.get("phone") ?? "",
    villageId: formData.get("villageId") ?? "",
    visibility: formData.get("visibility"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input = parsed.data;
  const supabase = await createClient();

  // Username uniqueness: the partial unique index is the real authority, but
  // checking first turns a constraint violation into a useful message.
  if (input.username !== user.profile?.username) {
    const { data: taken, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .maybeSingle();

    if (lookupError) {
      console.error("[profile.update] username lookup failed", lookupError);
      return { ok: false, formError: "Could not save your profile. Please try again." };
    }
    if (taken && taken.id !== user.id) {
      return { ok: false, fieldErrors: { username: "That username is taken" } };
    }
  }

  // Keep town_id consistent with the chosen village. `shares_community_with`
  // matches on village, community OR town, so a stale town would silently
  // widen who can see a "community-only" profile.
  let townId: string | null = null;
  if (input.villageId) {
    const { data: ancestors, error: ancestorError } = await supabase.rpc(
      "geo_ancestors",
      { entity_id: input.villageId },
    );

    if (ancestorError) {
      console.error("[profile.update] ancestor lookup failed", ancestorError);
    } else {
      townId = ancestors?.find((a) => a.kind === "town")?.id ?? null;
    }
  }

  // `.select()` for the same reason as posts and comments: RLS refuses by
  // filtering rather than raising, so a write that changes nothing returns no
  // error. Here zero rows would mean the profile row is missing entirely.
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName,
      username: input.username,
      bio: input.bio,
      occupation: input.occupation,
      website: input.website,
      phone: input.phone,
      village_id: input.villageId,
      town_id: townId,
      visibility: input.visibility,
    })
    .eq("id", user.id)
    .select("id");

  if (error) {
    console.error("[profile.update] save failed", error.message);
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { username: "That username is taken" } };
    }
    return { ok: false, formError: "Could not save your profile. Please try again." };
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      formError:
        "Your profile could not be found. Please contact an administrator.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/home");

  return { ok: true, message: "Your profile has been saved." };
}
