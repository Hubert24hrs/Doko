"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import {
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
  } catch (err: unknown) {
    console.error("initializeAdPaymentAction error:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to initialize payment." };
  }
}

export async function verifyPaymentAction(reference: string) {
  try {
    const parsed = verifyPaymentSchema.safeParse({ reference });
    if (!parsed.success) {
      return { success: false, error: "Invalid payment reference." };
    }

    const supabase = await createClient();

    // A signed-out caller has no business asking the platform to confirm a
    // payment. Deliberately not requireUser(): its redirect works by throwing,
    // and the catch below would swallow that into a generic failure message.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Sign in to confirm this payment." };
    }

    const verifyResult = await verifyPaystackTransaction(reference);

    // The confirming RPCs are SECURITY DEFINER and, since migration 028, are
    // callable only by the service role. That is deliberate: they mark money
    // as received, and the database cannot tell whether Paystack was actually
    // consulted -- so the only caller allowed to say so is the platform
    // itself, after verifyPaystackTransaction() above has said it.
    //
    // If the service-role key is not configured this throws, and the catch
    // below reports the payment as unconfirmed rather than confirming it on a
    // member's own authority.
    const privileged = createAdminClient();

    if (verifyResult.status !== "success") {
      // Privileged too: payments_update requires is_staff(), so this ran as a
      // member and quietly affected zero rows -- a failed payment stayed
      // 'pending' for ever, and nothing said so.
      await privileged
        .from("payments")
        .update({ status: verifyResult.status, updated_at: new Date().toISOString() })
        .eq("reference", reference);

      return {
        success: false,
        error: `Payment was not successful. Status: ${verifyResult.status}`,
      };
    }

    const { error: rpcError } = await privileged.rpc("confirm_ad_payment", {
      p_payment_reference: reference,
      p_paystack_ref: verifyResult.reference,
      p_channel: verifyResult.channel,
      p_paid_at: verifyResult.paidAt,
    });

    if (rpcError) {
      const { data: pmt } = await privileged
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
        await privileged
          .from("ad_campaigns")
          .update({ payment_status: "paid", updated_at: new Date().toISOString() })
          .eq("id", pmt.target_id);
      } else if (pmt?.target_id && pmt.purpose === "donation") {
        const donationNaira = Math.round(verifyResult.amountKobo / 100);
        await privileged.rpc("confirm_project_donation", {
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
  } catch (err: unknown) {
    console.error("verifyPaymentAction error:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to verify transaction." };
  }
}