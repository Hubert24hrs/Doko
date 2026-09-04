"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireStaff } from "@/features/auth/session";
import { adCampaignSchema, adModerationSchema } from "./schemas";
import { AdStatus } from "@/types/database";

export async function createAdCampaignAction(prevState: unknown, formData: FormData) {
  try {
    const user = await requireUser();
    const rawData = {
      title: formData.get("title")?.toString() || "",
      description: formData.get("description")?.toString() || "",
      target_url: formData.get("target_url")?.toString() || "",
      image_url: formData.get("image_url")?.toString() || "",
      placement: formData.get("placement")?.toString() || "feed_sponsored",
      target_village_id: formData.get("target_village_id")?.toString() || "",
      budget_naira: Number(formData.get("budget_naira")) || 0,
      duration_days: Number(formData.get("duration_days")) || 30,
    };

    const parsed = adCampaignSchema.safeParse(rawData);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { success: false, error: issue?.message || "Invalid advertisement details" };
    }

    const {
      title,
      description,
      target_url,
      image_url,
      placement,
      target_village_id,
      budget_naira,
      duration_days,
    } = parsed.data;

    const startsAt = new Date();
    const endsAt = new Date(Date.now() + duration_days * 86400000);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ad_campaigns")
      .insert({
        advertiser_id: user.id,
        title,
        description,
        target_url: target_url || null,
        image_url: image_url || null,
        placement,
        status: "pending",
        target_village_id: target_village_id || null,
        budget_naira,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create ad campaign" };
    }

    revalidatePath("/feed");
    revalidatePath("/marketplace");
    revalidatePath("/admin/ads");

    return {
      success: true,
      message: "Your ad campaign has been submitted for administrative review!",
      adId: data.id,
    };
  } catch (err: unknown) {
    return { success: false, error: (err instanceof Error ? err.message : null) || "An unexpected error occurred" };
  }
}

export async function moderateAdCampaignAction(
  adId: string,
  newStatus: AdStatus,
  rejectionReason?: string
) {
  try {
    const staff = await requireStaff();

    const parsed = adModerationSchema.safeParse({
      ad_id: adId,
      status: newStatus,
      rejection_reason: rejectionReason,
    });

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid moderation status" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("ad_campaigns")
      .update({
        status: newStatus,
        rejection_reason: rejectionReason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", adId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log admin action
    await supabase.rpc("log_admin_action", {
      p_action: `ad_campaign_${newStatus}`,
      p_entity_type: "ad_campaign",
      p_entity_id: adId,
      p_metadata: { staff_id: staff.id, rejection_reason: rejectionReason },
    });

    revalidatePath("/feed");
    revalidatePath("/marketplace");
    revalidatePath("/admin/ads");

    return { success: true, message: `Ad campaign status updated to ${newStatus}` };
  } catch (err: unknown) {
    return { success: false, error: (err instanceof Error ? err.message : null) || "Action failed" };
  }
}

export async function recordAdImpressionAction(adId: string) {
  if (adId.startsWith("fallback-")) return { success: true };
  try {
    const supabase = await createClient();
    await supabase.rpc("increment_ad_impressions", { p_ad_id: adId });
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function recordAdClickAction(adId: string) {
  if (adId.startsWith("fallback-")) return { success: true };
  try {
    const supabase = await createClient();
    await supabase.rpc("increment_ad_clicks", { p_ad_id: adId });
    return { success: true };
  } catch {
    return { success: false };
  }
}
