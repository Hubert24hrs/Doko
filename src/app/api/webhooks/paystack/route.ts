import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validatePaystackWebhookSignature } from "@/features/payments/paystack";
import { paystackWebhookPayloadSchema } from "@/features/payments/schemas";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    const isValid = validatePaystackWebhookSignature(rawBody, signature);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = paystackWebhookPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload structure" }, { status: 422 });
    }

    const { event, data } = parsed.data;

    if (event === "charge.success" && data.status === "success") {
      // No fallback to the request client any more. A webhook has no user
      // session, so that fallback was an ANON client -- which cannot update
      // payments (payments_update asks is_staff()) and, since migration 028,
      // cannot call the confirming RPCs either. It therefore did nothing while
      // returning 200 to Paystack, which reads as "handled" and stops it
      // retrying.
      //
      // Failing loudly instead: Paystack retries a non-2xx, so a missing
      // service-role key becomes a delayed payment rather than a lost one.
      let supabase;
      try {
        supabase = createAdminClient();
      } catch (cause) {
        console.error("[paystack.webhook] service role key unavailable", cause);
        return NextResponse.json(
          { error: "Payment processing is not configured" },
          { status: 503 },
        );
      }

      const reference = data.reference;

      const { data: payment, error } = await supabase
        .from("payments")
        .update({
          status: "success",
          paystack_reference: reference,
          channel: data.channel || "card",
          paid_at: data.paid_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference)
        .select()
        .single();

      if (!error && payment?.purpose === "ad_campaign" && payment.target_id) {
        await supabase
          .from("ad_campaigns")
          .update({ payment_status: "paid", updated_at: new Date().toISOString() })
          .eq("id", payment.target_id);
      } else if (!error && payment?.purpose === "donation" && payment.target_id) {
        const donationNaira = Math.round((data.amount || 0) / 100);
        await supabase.rpc("confirm_project_donation", {
          p_payment_reference: reference,
          p_project_id: payment.target_id,
          p_amount_naira: donationNaira,
          p_paystack_ref: reference,
          p_channel: data.channel || "card",
          p_paid_at: data.paid_at || new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("Paystack webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}