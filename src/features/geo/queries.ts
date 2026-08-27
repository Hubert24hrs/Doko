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

export const getGeoEntityBySlug = cache(
  async (slug: string): Promise<GeoEntityRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("geo_entities")
      .select("*")
      .eq("slug", slug)
      .is("deleted_at", null)
      .limit(1)
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
