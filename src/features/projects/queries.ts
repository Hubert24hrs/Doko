import { cache } from "react";
import { createAnonymousClient } from "@/lib/supabase/server";
import { CommunityProjectRow } from "@/types/database";

export interface ProjectListItem extends CommunityProjectRow {
  creator_name?: string;
  village_name?: string;
  percentage_funded: number;
}

export interface CommunityProjectsResult {
  projects: ProjectListItem[];
  /**
   * True when the query itself failed. Distinct from an empty list, and the
   * distinction is the whole point: "no appeals have been raised yet" and "we
   * could not find out" are different statements, and the page must not make
   * the second one look like the first.
   */
  unavailable: boolean;
}

/**
 * This function used to return three FABRICATED fundraising appeals whenever
 * the query came back empty or failed -- "Amufie Market Square Solar
 * Streetlights", ₦980,000 raised from 42 supporters -- rendered with a live
 * "Contribute via Paystack" button beside them.
 *
 * Migration 031 exists to stop a project creator typing a raised total into
 * the database, because a progress bar is the social proof that persuades the
 * next person to give. This typed one straight into the page, for appeals that
 * did not exist at all, and solicited money against it on a public URL.
 *
 * An empty directory is the honest thing to show when nobody has raised an
 * appeal yet.
 */
export const getCommunityProjects = cache(async (): Promise<CommunityProjectsResult> => {
  try {
    const supabase = createAnonymousClient();
    const { data, error } = await supabase
      .from("community_projects")
      .select(`
        *,
        profiles:creator_id (full_name),
        geo_entities:target_village_id (name)
      `)
      .in("status", ["active", "completed"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[projects.list] failed", error.message);
      return { projects: [], unavailable: true };
    }
    if (!data || data.length === 0) {
      return { projects: [], unavailable: false };
    }

    type ProjectWithRelations = CommunityProjectRow & {
      profiles?: { full_name?: string | null } | null;
      geo_entities?: { name?: string | null } | null;
    };
    const projects = (data as unknown as ProjectWithRelations[]).map((item) => {
      const target = Number(item.target_amount_naira) || 1;
      const raised = Number(item.raised_amount_naira) || 0;
      const pct = Math.min(100, Math.round((raised / target) * 100));

      return {
        ...item,
        creator_name: item.profiles?.full_name || "Community Member",
        village_name: item.geo_entities?.name || "Igbo Eze North",
        percentage_funded: pct,
      };
    });

    return { projects, unavailable: false };
  } catch (err) {
    console.error('[projects.list] threw', err);
    return { projects: [], unavailable: true };
  }
});
