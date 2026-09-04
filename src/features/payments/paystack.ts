import crypto from "crypto";

export interface PaystackInitParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
  is_mock?: boolean;
}

export interface PaystackVerifyResult {
  status: "success" | "failed" | "abandoned";
  reference: string;
  amountKobo: number;
  currency: string;
  channel: string;
  paidAt: string | null;
  gatewayResponse: string;
  customerEmail: string;
  metadata: Record<string, unknown>;
}

export function getPaystackSecretKey(): string | null {
  return process.env.PAYSTACK_SECRET_KEY || null;
}

export function generatePaymentReference(prefix = "EZK"): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}

export function validatePaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    return process.env.NODE_ENV !== "production" && signatureHeader === "test-mock-signature";
  }
  if (!signatureHeader) return false;

  const hash = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");

  return hash === signatureHeader;
}

export async function initializePaystackTransaction(
  params: PaystackInitParams
): Promise<PaystackInitResult> {
  const secretKey = getPaystackSecretKey();

  if (!secretKey) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const callback = params.callbackUrl || `${siteUrl}/payments/callback`;
    const mockUrl = `${callback}?reference=${encodeURIComponent(params.reference)}&mock=success`;
    return {
      authorization_url: mockUrl,
      access_code: `mock_code_${params.reference}`,
      reference: params.reference,
      is_mock: true,
    };
  }

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to initialize Paystack checkout");
  }

  return {
    authorization_url: data.data.authorization_url,
    access_code: data.data.access_code,
    reference: data.data.reference,
    is_mock: false,
  };
}

export async function verifyPaystackTransaction(
  reference: string
): Promise<PaystackVerifyResult> {
  const secretKey = getPaystackSecretKey();

  if (!secretKey) {
    return {
      status: "success",
      reference,
      amountKobo: 500000,
      currency: "NGN",
      channel: "card",
      paidAt: new Date().toISOString(),
      gatewayResponse: "Successful (Development Mock)",
      customerEmail: "user@example.com",
      metadata: {},
    };
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to verify Paystack payment");
  }

  const d = data.data;
  return {
    status: d.status === "success" ? "success" : d.status === "failed" ? "failed" : "abandoned",
    reference: d.reference,
    amountKobo: d.amount,
    currency: d.currency || "NGN",
    channel: d.channel || "card",
    paidAt: d.paid_at || null,
    gatewayResponse: d.gateway_response || "",
    customerEmail: d.customer?.email || "",
    metadata: d.metadata || {},
  };
}