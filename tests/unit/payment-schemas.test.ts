import { describe, it, expect } from "vitest";
import {
  initializePaymentSchema,
  verifyPaymentSchema,
  paystackWebhookPayloadSchema,
  nairaToKobo,
  koboToNaira,
} from "@/features/payments/schemas";
import { generatePaymentReference } from "@/features/payments/paystack";

describe("Payment Schemas & Helpers", () => {
  it("validates payment initialization with standard parameters", () => {
    const valid = initializePaymentSchema.safeParse({
      amount_naira: 5000,
      purpose: "ad_campaign",
      target_id: "123e4567-e89b-12d3-a456-426614174000",
      callback_url: "https://doko-delta.vercel.app/payments/callback",
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.amount_naira).toBe(5000);
      expect(valid.data.purpose).toBe("ad_campaign");
      expect(valid.data.target_id).toBe("123e4567-e89b-12d3-a456-426614174000");
    }
  });

  it("rejects payment initialization with amount below minimum (₦100)", () => {
    const res = initializePaymentSchema.safeParse({
      amount_naira: 50,
      purpose: "ad_campaign",
    });

    expect(res.success).toBe(false);
  });

  it("rejects payment initialization with amount above ceiling (₦5,000,000)", () => {
    const res = initializePaymentSchema.safeParse({
      amount_naira: 6000000,
      purpose: "ad_campaign",
    });

    expect(res.success).toBe(false);
  });

  it("validates transaction reference schema", () => {
    const valid = verifyPaymentSchema.safeParse({
      reference: "EZK_AD_MOCK_12345",
    });
    expect(valid.success).toBe(true);

    const invalid = verifyPaymentSchema.safeParse({
      reference: "short",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates Paystack webhook payload structure", () => {
    const payload = {
      event: "charge.success",
      data: {
        reference: "EZK_AD_MOCK_12345",
        status: "success",
        amount: 500000,
        currency: "NGN",
        channel: "card",
        paid_at: "2026-09-04T12:00:00.000Z",
      },
    };

    const parsed = paystackWebhookPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.event).toBe("charge.success");
      expect(parsed.data.data.amount).toBe(500000);
      expect(parsed.data.data.currency).toBe("NGN");
    }
  });

  it("correctly converts between Naira and Kobo", () => {
    expect(nairaToKobo(5000)).toBe(500000);
    expect(nairaToKobo(150.5)).toBe(15050);
    expect(koboToNaira(500000)).toBe(5000);
    expect(koboToNaira(25000)).toBe(250);
  });

  it("generates unique payment references with given prefix", () => {
    const ref1 = generatePaymentReference("EZK_AD");
    const ref2 = generatePaymentReference("EZK_AD");

    expect(ref1.startsWith("EZK_AD_")).toBe(true);
    expect(ref2.startsWith("EZK_AD_")).toBe(true);
    expect(ref1).not.toBe(ref2);
    expect(ref1.length).toBeGreaterThan(12);
  });
});