import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { GeoEntityRow, GeoKind } from "@/types/database";

export interface GeoNode extends GeoEntityRow {
  children: GeoNode[];
}

/**
 * The geographic tree is reference data that changes rarely and is read on
 * nearly every page. `cache()` dedupes it within a single render pass; the
 * Next.js fetch cache is not involved because this goes through the Supabase
 * client rather than `fetch`.
 */
export const getGeoTree = cache(async (): Promise<GeoNode[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("geo_entities")
    .select("*")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[geo.getGeoTree] query failed", error.message);
    throw new Error("Could not load the community directory.");
  }

  return buildTree(data ?? []);
});

/** Assemble an adjacency list into a tree in one pass. */
export function buildTree(rows: GeoEntityRow[]): GeoNode[] {
  const byId = new Map<string, GeoNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }

  const roots: GeoNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id) {
      const parent = byId.get(node.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent is filtered out (archived or soft-deleted). Promote the child
        // rather than dropping it silently, so nothing disappears from the UI.
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Flat list of one kind, for select inputs. */
export const getGeoEntitiesByKind = cache(
  async (kind: GeoKind): Promise<GeoEntityRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("geo_entities")
      .select("*")
      .eq("kind", kind)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error("[geo.getGeoEntitiesByKind] query failed", error.message);
      throw new Error("Could not load communities.");
    }
    return data ?? [];
  },
);

/**
 * Villages with their district and town names, for the registration picker.
 * One query with embedded parents — not a per-row lookup.
 */
export interface VillageOption {
  id: string;
  name: string;
  districtName: string | null;
  townName: string | null;
}

export const getVillageOptions = cache(async (): Promise<VillageOption[]> => {
  // Village is an OPTIONAL field on sign-up, so this must never be able to
  // block registration. Any failure yields an empty list and the picker simply
  // offers "Prefer not to say".
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("geo_entities")
      .select("id, name, parent:parent_id ( name, parent:parent_id ( name ) )")
      .eq("kind", "village")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error("[geo.getVillageOptions] query failed", error.message);
      return [];
    }

    type Embedded = {
      id: string;
      name: string;
      parent: { name: string; parent: { name: string } | null } | null;
    };

    return ((data ?? []) as unknown as Embedded[]).map((row) => ({
      id: row.id,
      name: row.name,
      districtName: row.parent?.name ?? null,
      townName: row.parent?.parent?.name ?? null,
    }));
  } catch (cause) {
    console.error("[geo.getVillageOptions] unavailable", cause);
    return [];
  }
});

/**
 * Resolve a slug to exactly one community.
 *
 * Deliberately NO `.limit(1)`. Migration 002's uniqueness index is scoped to
 * the parent, which is right for a tree and useless for a URL -- and the seed
 * shipped a collision on it: `Ezzodo` is both a district of Enugu-Ezike and an
 * INEC ward. With `.limit(1)` this returned whichever row came back first, so
 * /communities/ezzodo could have shown a different place on a different day
 * with no error anywhere.
 *
 * Migration 036 makes the slug globally unique. `maybeSingle()` without a limit
 * is how this code REFUSES to paper over it again: if a duplicate ever exists,
 * PostgREST raises rather than guessing, and the page 404s loudly instead of
 * lying quietly.
 */
export const getGeoEntityBySlug = cache(
  async (slug: string): Promise<GeoEntityRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("geo_entities")
      .select("*")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[geo.getGeoEntityBySlug] query failed", error.message);
      return null;
    }
    return data;
  },
);

/** Root-to-entity path, for breadcrumbs. */
export async function getGeoAncestors(entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("geo_ancestors", {
    entity_id: entityId,
  });

  if (error) {
    console.error("[geo.getGeoAncestors] rpc failed", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Every entity at or beneath `entityId`, as ids.
 *
 * A community page has to show what happened IN that place, and almost nothing
 * is tagged at town level: a post about the Nkwo market carries the village's
 * geo_id, not Enugu-Ezike's. Filtering a town page on `geo_id = town.id` would
 * therefore show an empty town containing thirty busy villages.
 *
 * The result always includes `entityId` itself, so the caller can pass it
 * straight to `.in("geo_id", ids)`.
 */
export const getGeoDescendantIds = cache(
  async (entityId: string): Promise<string[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("geo_descendants", {
      entity_id: entityId,
    });

    if (error) {
      console.error("[geo.getGeoDescendantIds] rpc failed", error.message);
      // Narrowing to the entity itself is the safe failure: the page shows
      // less than it should rather than everything on the platform.
      return [entityId];
    }

    const ids = (data ?? []).map((row: { id: string }) => row.id);
    return ids.length > 0 ? ids : [entityId];
  },
);

/** The immediate children of an entity, in the order admins arranged them. */
export const getGeoChildren = cache(
  async (entityId: string): Promise<GeoEntityRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("geo_entities")
      .select("*")
      .eq("parent_id", entityId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[geo.getGeoChildren] query failed", error.message);
      return [];
    }
    return data ?? [];
  },
);

/**
 * May the current viewer correct this community's details?
 *
 * Asks the same two things geo_entities_update_admin asks, so the control is
 * offered exactly when the write would land. Getting this wrong in the
 * permissive direction shows a button that silently does nothing -- the
 * failure mode migration 029 was written for.
 *
 * A `community_admin` is NOT staff (is_staff is super_admin, admin, moderator),
 * so they cannot reach /admin at all. Their editing surface is the community's
 * own page, which is where they are standing when they notice the misspelling.
 */
export const canEditCommunity = cache(
  async (entityId: string): Promise<boolean> => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const [{ data: admin }, { data: administers }] = await Promise.all([
      supabase.rpc("is_admin", {}),
      supabase.rpc("administers_geo", { entity_id: entityId }),
    ]);

    return admin === true || administers === true;
  },
);

/** A community that has a position, for labelling the map. */
export type MappedPlace = {
  name: string;
  kind: string;
  slug: string;
  latitude: number;
  longitude: number;
};

/**
 * Every live community that has coordinates, for the issues map.
 *
 * The map used to label ten places from a constant hard-coded in a component
 * -- which put "LGA HQ" on Ogrute (a village; the seed names Enugu-Ezike as the
 * headquarters town), labelled two places that are not in the directory at all,
 * called the Umuitodo district a village, and gave coordinates with no source.
 * It also meant an admin correcting a village's position through the
 * community page changed nothing on the map.
 *
 * Geography here is database rows edited in-app, never constants in a
 * component; this is the map obeying that. A place with no coordinates yet is
 * simply not labelled -- the map shows fewer names rather than invented ones.
 */
export const getMappedPlaces = cache(async (): Promise<MappedPlace[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("geo_entities")
      .select("name, kind, slug, latitude, longitude")
      .is("deleted_at", null)
      .eq("status", "active")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) {
      console.error("[geo.getMappedPlaces] query failed", error.message);
      return [];
    }
    // The query already excludes NULL coordinates; the map stays defensive.
    return (data ?? []).flatMap((p) =>
      typeof p.latitude === "number" && typeof p.longitude === "number"
        ? [{ name: p.name, kind: p.kind, slug: String(p.slug), latitude: p.latitude, longitude: p.longitude }]
        : [],
    );
  } catch (cause) {
    console.error("[geo.getMappedPlaces] unavailable", cause);
    return [];
  }
});
