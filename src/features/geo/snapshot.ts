import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { GeoKind } from "@/types/database";

export interface CommunitySnapshot {
  /**
   * False when the database could not be reached or the environment is not
   * configured. The page renders an honest placeholder rather than zeros,
   * which would read as "there are no villages".
   */
  available: boolean;
  towns: number;
  districts: number;
  villages: number;
  wards: number;
}

const UNAVAILABLE: CommunitySnapshot = {
  available: false,
  towns: 0,
  districts: 0,
  villages: 0,
  wards: 0,
};

/**
 * Counts per geographic kind, using HEAD requests so Postgres returns the
 * count without shipping any rows.
 */
export const getCommunitySnapshot = cache(
  async (): Promise<CommunitySnapshot> => {
    try {
      const supabase = await createClient();

      const countOf = async (kind: GeoKind) => {
        const { count, error } = await supabase
          .from("geo_entities")
          .select("id", { count: "exact", head: true })
          .eq("kind", kind)
          .eq("status", "active")
          .is("deleted_at", null);
        if (error) throw new Error(error.message);
        return count ?? 0;
      };

      const [towns, districts, villages, wards] = await Promise.all([
        countOf("town"),
        countOf("district"),
        countOf("village"),
        countOf("area"),
      ]);

      return { available: true, towns, districts, villages, wards };
    } catch (cause) {
      // Missing env vars during a build, or a database that is not reachable
      // yet. Neither should take the public homepage down.
      console.warn(
        "[geo.snapshot] unavailable:",
        cause instanceof Error ? cause.message : cause,
      );
      return UNAVAILABLE;
    }
  },
);
