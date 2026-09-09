"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/features/auth/session";
import { createCommunitySchema, updateCommunitySchema } from "./schemas";

export interface GeoActionState {
  ok: boolean;
  formError?: string;
  /** Where to go afterwards, when a create or a rename changed the URL. */
  slug?: string;
}

/**
 * Correct the details of a community.
 *
 * Deliberately NOT gated on `requireAdmin()`. The point of the community_admin
 * role is that the person in Umuida knows how Umuida is spelled, and
 * geo_entities_update_admin already admits `administers_geo(id)`. The server
 * checks only that somebody is signed in; the DATABASE decides whether this
 * particular person may touch this particular row.
 *
 * Which is why the row count below is not optional. RLS refuses an UPDATE by
 * FILTERING, not by raising, so `error` being null does not mean anything
 * changed -- exactly the failure that made verification delegation report
 * success while writing nothing until migration 029.
 *
 * The guard trigger from migration 037 narrows this further: a community admin
 * may change what the place is CALLED, never where it sits. If they send
 * parent_id or slug anyway, the trigger restores them and this still reports
 * success -- correctly, because their name change did land. The form does not
 * offer those fields to them.
 */
export async function updateCommunityAction(
  _prev: GeoActionState,
  formData: FormData,
): Promise<GeoActionState> {
  await requireUser();

  const parsed = updateCommunitySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    aliases: formData.get("aliases") ?? undefined,
    sortOrder: formData.get("sortOrder") ?? undefined,
    latitude: formData.get("latitude") ?? undefined,
    longitude: formData.get("longitude") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, formError: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("geo_entities")
    .select("name, description, aliases, latitude, longitude, sort_order")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("geo_entities")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      aliases: parsed.data.aliases,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      sort_order: parsed.data.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("id, slug");

  if (error) {
    console.error("[geo.update] failed", error.message);
    return { ok: false, formError: "That change could not be saved." };
  }

  if (!data || data.length === 0) {
    console.error("[geo.update] refused for", parsed.data.id);
    return {
      ok: false,
      formError: "You do not have permission to edit this community.",
    };
  }

  // The directory is administrative data about real places, and a name that
  // changed with no record of who changed it is exactly what audit_logs exists
  // for. Failure here must not lose the edit that already succeeded.
  const { error: auditError } = await supabase.rpc("log_admin_action", {
    p_action: "geo.update",
    p_entity_type: "geo_entities",
    p_entity_id: parsed.data.id,
    p_previous_state: before ?? null,
    p_new_state: {
      name: parsed.data.name,
      description: parsed.data.description,
      aliases: parsed.data.aliases,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      sort_order: parsed.data.sortOrder,
    },
  });
  if (auditError) console.error("[geo.update] audit failed", auditError.message);

  revalidatePath("/communities");
  revalidatePath(`/communities/${data[0].slug}`);
  revalidatePath("/admin/communities");

  return { ok: true, slug: data[0].slug };
}

/**
 * Add a community to the directory. Platform admins only: creating one decides
 * where it sits, and that is a structural act (see migration 037).
 */
export async function createCommunityAction(
  _prev: GeoActionState,
  formData: FormData,
): Promise<GeoActionState> {
  await requireAdmin();

  const parsed = createCommunitySchema.safeParse({
    parentId: formData.get("parentId"),
    kind: formData.get("kind"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    aliases: formData.get("aliases") ?? undefined,
    latitude: formData.get("latitude") ?? undefined,
    longitude: formData.get("longitude") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, formError: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();

  // Ask the database for a free slug rather than guessing and failing on the
  // unique index. Migration 036 added geo_free_slug for exactly this, the same
  // way handle_new_user already de-duplicates usernames.
  const { data: slug, error: slugError } = await supabase.rpc("geo_free_slug", {
    desired_name: parsed.data.name,
  });

  if (slugError || !slug) {
    console.error("[geo.create] slug failed", slugError?.message);
    return { ok: false, formError: "That name could not be turned into an address." };
  }

  const { data, error } = await supabase
    .from("geo_entities")
    .insert({
      parent_id: parsed.data.parentId,
      kind: parsed.data.kind,
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      aliases: parsed.data.aliases,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    })
    .select("id, slug")
    .maybeSingle();

  if (error) {
    console.error("[geo.create] failed", error.message);
    // The two the person can actually act on, rather than a raw constraint name.
    if (error.message.includes("root_only_lga")) {
      return {
        ok: false,
        formError:
          "Only a Local Government Area sits at the top of the tree, and only one may exist.",
      };
    }
    return { ok: false, formError: "That community could not be added." };
  }

  if (!data) {
    return { ok: false, formError: "You do not have permission to add a community." };
  }

  const { error: auditError } = await supabase.rpc("log_admin_action", {
    p_action: "geo.create",
    p_entity_type: "geo_entities",
    p_entity_id: data.id,
    p_new_state: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      slug: data.slug,
      parent_id: parsed.data.parentId,
    },
  });
  if (auditError) console.error("[geo.create] audit failed", auditError.message);

  revalidatePath("/communities");
  revalidatePath("/admin/communities");

  return { ok: true, slug: data.slug };
}
