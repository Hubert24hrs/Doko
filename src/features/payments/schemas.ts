import { z } from "zod";

export const paymentPurposeEnum = z.enum(["ad_campaign", "featured_listing", "donation"]);
export const paymentStatusEnum = z.enum(["pending", "success", "failed", "abandoned"]);

export const initializePaymentSchema = z.object({
  amount_naira: z
    .number()
    .int("Amount must be a whole number of Naira")
    .min(100, "Minimum payment amount is ₦100")
    .max(5000000, "Payment amount cannot exceed ₦5,000,000"),
  purpose: paymentPurposeEnum.default("ad_campaign"),
  target_id: z.string().uuid("Invalid target item ID").optional().or(z.literal("")),
  callback_url: z.string().url("Invalid callback URL").optional().or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const verifyPaymentSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(8, "Payment reference is too short")
    .max(100, "Payment reference is too long"),
});

export const paystackWebhookDataSchema = z.object({
  reference: z.string(),
  status: z.string(),
  amount: z.number(),
  currency: z.string().default("NGN"),
  channel: z.string().optional().nullable(),
  paid_at: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const paystackWebhookPayloadSchema = z.object({
  event: z.string(),
  data: paystackWebhookDataSchema,
});

export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type PaystackWebhookPayload = z.infer<typeof paystackWebhookPayloadSchema>;

export function nairaToKobo(amountNaira: number): number {
  return Math.round(amountNaira * 100);
}

export function koboToNaira(amountKobo: number): number {
  return amountKobo / 100;
}