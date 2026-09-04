"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import {
  initializePaymentSchema,
  verifyPaymentSchema,
  nairaToKobo,
} from "./schemas";
import {
  generatePaymentReference,
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from "./paystack";

export async function initializeAdPaymentAction(adId: string, amountNaira?: number) {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { data: ad, error: adError } = await supabase
      .from("ad_campaigns")
      .select("id, advertiser_id, title, budget_naira")
      .eq("id", adId)
      .single();

    if (adError || !ad) {
      return { success: false, error: "Advertisement campaign not found." };
    }

    if (ad.advertiser_id !== user.id) {
      return { success: false, error: "You are not authorized to pay for this campaign." };
    }

    const budget = amountNaira || ad.budget_naira || 5000;
    const amountKobo = nairaToKobo(budget);
    const reference = generatePaymentReference("EZK_AD");

    const { error: insertError } = await supabase.from("payments").insert({
      user_id: user.id,
      reference,
      amount_kobo: amountKobo,
      currency: "NGN",
      status: "pending",
      purpose: "ad_campaign",
      target_id: ad.id,
      metadata: {
        ad_title: ad.title,
        budget_naira: budget,
      },
    });

    if (insertError) {
      console.error("Failed to record pending payment:", insertError);
      return { success: false, error: "Failed to initialize payment record." };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const callbackUrl = `${siteUrl}/payments/callback`;

    const paystackRes = await initializePaystackTransaction({
      email: user.email || "customer@ezikeoba.org",
      amountKobo,
      reference,
      callbackUrl,
      metadata: {
        ad_id: ad.id,
        user_id: user.id,
        purpose: "ad_campaign",
      },
    });

    return {
      success: true,
      authorization_url: paystackRes.authorization_url,
      reference,
      is_mock: paystackRes.is_mock,
    };
  } catch (err: any) {
    console.error("initializeAdPaymentAction error:", err);
    return { success: false, error: err.message || "Failed to initialize payment." };
  }
}

export async function verifyPaymentAction(reference: string) {
  try {
    const parsed = verifyPaymentSchema.safeParse({ reference });
    if (!parsed.success) {
      return { success: false, error: "Invalid payment reference." };
    }

    const supabase = await createClient();
    const verifyResult = await verifyPaystackTransaction(reference);

    if (verifyResult.status !== "success") {
      await supabase
        .from("payments")
        .update({ status: verifyResult.status, updated_at: new Date().toISOString() })
        .eq("reference", reference);

      return {
        success: false,
        error: `Payment was not successful. Status: ${verifyResult.status}`,
      };
    }

    const { error: rpcError } = await supabase.rpc("confirm_ad_payment", {
      p_payment_reference: reference,
      p_paystack_ref: verifyResult.reference,
      p_channel: verifyResult.channel,
      p_paid_at: verifyResult.paidAt,
    });

    if (rpcError) {
      const { data: pmt } = await supabase
        .from("payments")
        .update({
          status: "success",
          paystack_reference: verifyResult.reference,
          channel: verifyResult.channel,
          paid_at: verifyResult.paidAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference)
        .select()
        .single();

      if (pmt?.target_id && pmt.purpose === "ad_campaign") {
        await supabase
          .from("ad_campaigns")
          .update({ payment_status: "paid", updated_at: new Date().toISOString() })
          .eq("id", pmt.target_id);
      } else if (pmt?.target_id && pmt.purpose === "donation") {
        const donationNaira = Math.round(verifyResult.amountKobo / 100);
        await supabase.rpc("confirm_project_donation", {
          p_payment_reference: reference,
          p_project_id: pmt.target_id,
          p_amount_naira: donationNaira,
          p_paystack_ref: verifyResult.reference,
          p_channel: verifyResult.channel,
          p_paid_at: verifyResult.paidAt,
        });
      }
    }

    revalidatePath("/feed");
    revalidatePath("/marketplace");
    revalidatePath("/admin/ads");
    revalidatePath("/projects");

    return {
      success: true,
      reference,
      amountKobo: verifyResult.amountKobo,
      channel: verifyResult.channel,
      gatewayResponse: verifyResult.gatewayResponse,
    };
  } catch (err: any) {
    console.error("verifyPaymentAction error:", err);
    return { success: false, error: err.message || "Failed to verify transaction." };
  }
}