import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SponsoredAdItem, AdCampaignRow, AdPlacement } from "@/types/database";

export const getActiveSponsoredAds = cache(
  async (
    placement: AdPlacement = "feed_sponsored",
    limit = 5
  ): Promise<SponsoredAdItem[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("get_active_sponsored_ads", {
        p_placement: placement,
        p_limit: limit,
      });

      if (error || !data) {
        console.warn("Failed to fetch active sponsored ads RPC:", error?.message);
        return getFallbackSponsoredAds(placement);
      }

      const items = data as SponsoredAdItem[];
      if (items.length === 0) {
        return getFallbackSponsoredAds(placement);
      }

      return items;
    } catch (err) {
      console.error("Error in getActiveSponsoredAds:", err);
      return getFallbackSponsoredAds(placement);
    }
  }
);

export const getAdvertiserCampaigns = cache(
  async (advertiserId: string): Promise<AdCampaignRow[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("ad_campaigns")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .order("created_at", { ascending: false });

      if (error || !data) {
        return [];
      }

      return data as AdCampaignRow[];
    } catch {
      return [];
    }
  }
);

export const getPendingAdCampaigns = cache(
  async (): Promise<(AdCampaignRow & { advertiser_name?: string })[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("ad_campaigns")
        .select("*, profiles:advertiser_id(full_name)")
        .order("created_at", { ascending: false });

      if (error || !data) {
        return [];
      }

      type AdWithProfile = AdCampaignRow & { profiles?: { full_name?: string | null } | null };
      return (data as unknown as AdWithProfile[]).map((item) => ({
        ...item,
        advertiser_name: item.profiles?.full_name || "Community Member",
      }));
    } catch {
      return [];
    }
  }
);

function getFallbackSponsoredAds(placement: AdPlacement): SponsoredAdItem[] {
  if (placement === "marketplace_banner") {
    return [
      {
        id: "fallback-market-1",
        advertiser_id: "system-sponsor",
        title: "Igbo Eze North Farmers & Traders Cooperative",
        description: "Buy fresh palm oil, yam, and cassava directly from local Enugu Ezike farmers.",
        target_url: "https://doko-delta.vercel.app/marketplace",
        image_url: null,
        placement: "marketplace_banner",
        status: "active",
        target_village_id: null,
        budget_naira: 0,
        impressions_count: 100,
        clicks_count: 12,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
        advertiser_name: "Ezike Oba Agricultural Board",
        advertiser_avatar: null,
        advertiser_is_verified: true,
        advertiser_verification_type: "gold",
      },
    ];
  }

  return [
    {
      id: "fallback-feed-1",
      advertiser_id: "system-sponsor",
      title: "Promote Your Business Across Igbo Eze North",
      description: "Reach thousands of verified community members, diaspora kin, and local customers on Ezike Oba.",
      target_url: "https://doko-delta.vercel.app/marketplace",
      image_url: null,
      placement: "feed_sponsored",
      status: "active",
      target_village_id: null,
      budget_naira: 0,
      impressions_count: 250,
      clicks_count: 35,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      advertiser_name: "Ezike Oba Commerce Hub",
      advertiser_avatar: null,
      advertiser_is_verified: true,
      advertiser_verification_type: "gold",
    },
  ];
}
