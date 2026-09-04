"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { verificationRequestSchema } from "./schemas";

export interface VerificationActionState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function submitVerificationRequestAction(
  _prev: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const user = await requireUser("/verification");

  const parsed = verificationRequestSchema.safeParse({
    tier: formData.get("tier"),
    organization: formData.get("organization"),
    roleTitle: formData.get("roleTitle"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      formError: "Please check your inputs.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();

  // Check if already verified
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_verified")
    .eq("id", user.id)
    .single();

  if (profile?.is_verified) {
    return { ok: false, formError: "Your profile is already verified." };
  }

  // Insert verification request
  const { error } = await supabase.from("verification_requests").insert({
    user_id: user.id,
    tier: parsed.data.tier,
    organization: parsed.data.organization ?? null,
    role_title: parsed.data.roleTitle ?? null,
    notes: parsed.data.notes ?? null,
    status: "pending",
  });

  if (error) {
    console.error("[verification.submit] failed", error.message);
    return { ok: false, formError: "Could not submit verification request. Please try again." };
  }

  revalidatePath("/verification");
  revalidatePath("/home");
  return { ok: true };
}

export async function cancelVerificationRequestAction(
  _prev: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const user = await requireUser("/verification");
  const requestId = formData.get("requestId");

  if (typeof requestId !== "string" || !requestId) {
    return { ok: false, formError: "Invalid request ID." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("verification_requests")
    .delete()
    .eq("id", requestId)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("[verification.cancel] failed", error.message);
    return { ok: false, formError: "Could not cancel request." };
  }

  revalidatePath("/verification");
  return { ok: true };
}
