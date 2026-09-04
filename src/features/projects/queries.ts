import { cache } from "react";
import { createAnonymousClient } from "@/lib/supabase/server";
import { CommunityProjectRow } from "@/types/database";

export interface ProjectListItem extends CommunityProjectRow {
  creator_name?: string;
  village_name?: string;
  percentage_funded: number;
}

export const getCommunityProjects = cache(async (): Promise<ProjectListItem[]> => {
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

    if (error || !data || data.length === 0) {
      return getFallbackProjects();
    }

    type ProjectWithRelations = CommunityProjectRow & {
      profiles?: { full_name?: string | null } | null;
      geo_entities?: { name?: string | null } | null;
    };
    return (data as unknown as ProjectWithRelations[]).map((item) => {
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
  } catch {
    return getFallbackProjects();
  }
});

function getFallbackProjects(): ProjectListItem[] {
  return [
    {
      id: "mock-proj-1",
      creator_id: "system-lead",
      title: "Amufie Market Square Solar Streetlights Installation",
      description: "Installation of 15 high-capacity all-in-one solar streetlights across Eke Amufie market square and the surrounding junction to illuminate night traders and enhance security.",
      category: "electricity_solar",
      target_village_id: null,
      target_amount_naira: 1500000,
      raised_amount_naira: 980000,
      donors_count: 42,
      status: "active",
      image_url: "https://images.unsplash.com/photo-1509391365360-2e959784a276",
      rejection_reason: null,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 45 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator_name: "Amufie Progressive Youth Union",
      village_name: "Amufie",
      percentage_funded: 65,
    },
    {
      id: "mock-proj-2",
      creator_id: "system-lead",
      title: "Ogrute Central Water Borehole Motor & Tank Rehabilitation",
      description: "Repair of the submersible pumping machine, installation of solar inverters, and replacement of cracked overhead storage tanks at the central community water point in Ogrute.",
      category: "water_borehole",
      target_village_id: null,
      target_amount_naira: 850000,
      raised_amount_naira: 620000,
      donors_count: 31,
      status: "active",
      image_url: "https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7",
      rejection_reason: null,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator_name: "Ogrute Development Association",
      village_name: "Ogrute",
      percentage_funded: 73,
    },
    {
      id: "mock-proj-3",
      creator_id: "system-lead",
      title: "Umuida to Imufu Feeder Road Grading & Drainage Clearing",
      description: "Communal grading of the 4km unpaved farm access road between Umuida and Imufu to enable farm produce transport before the heavy rainy season.",
      category: "road",
      target_village_id: null,
      target_amount_naira: 2200000,
      raised_amount_naira: 1450000,
      donors_count: 58,
      status: "active",
      image_url: "https://images.unsplash.com/photo-1545459720-aac8509eb02c",
      rejection_reason: null,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 60 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator_name: "Igbo Eze North Farmers Alliance",
      village_name: "Umuida",
      percentage_funded: 66,
    },
  ];
}