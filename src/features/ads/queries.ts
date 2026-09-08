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

      // No fabricated adverts. This used to fall back to two invented
      // campaigns whenever the query failed OR simply returned nothing --
      // attributed to organisations that do not exist ("Ezike Oba
      // Agricultural Board"), and each one carrying
      // advertiser_verification_type: "gold".
      //
      // Gold is this platform's highest trust signal, reserved for office
      // holders, Igwes and elders and granted only through the moderated
      // queue that migrations 023 and 029 exist to protect. Awarding one in
      // a TypeScript literal walks past all of it. An empty feed slot is the
      // correct rendering when nobody has bought an advert.
      if (error || !data) {
        console.warn("Failed to fetch active sponsored ads RPC:", error?.message);
        return [];
      }

      return data as SponsoredAdItem[];
    } catch (err) {
      console.error("Error in getActiveSponsoredAds:", err);
      return [];
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
