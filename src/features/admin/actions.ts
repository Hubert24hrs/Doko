"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff, requireVerifier } from "@/features/auth/session";
import {
  toggleVerificationSchema,
  toggleSuspensionSchema,
  toggleVerificationDelegateSchema,
  reviewVerificationRequestSchema,
  adminIssueStatusSchema,
} from "./schemas";
import type { VerificationType } from "@/types/database";

export interface AdminActionState {
  ok: boolean;
  formError?: string;
}

export async function toggleVerificationAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const verifier = await requireVerifier();

  const parsed = toggleVerificationSchema.safeParse({
    memberId: formData.get("memberId"),
    intent: formData.get("intent"),
    tier: formData.get("tier") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid request parameters." };
  }

  const isVerifying = parsed.data.intent === "verify";
  const tier: VerificationType | null = isVerifying
    ? ((parsed.data.tier as VerificationType) || "blue")
    : null;

  const supabase = await createClient();

  // Profiles check constraint requires:
  // (is_verified = false and verified_at is null and verification_type is null) or
  // (is_verified = true and verified_at is not null and verification_type is not null)
  const { error } = await supabase
    .from("profiles")
    .update({
      is_verified: isVerifying,
      verified_at: isVerifying ? new Date().toISOString() : null,
      verification_type: tier,
    })
    .eq("id", parsed.data.memberId);

  if (error) {
    console.error("[admin.verify] failed", error.message);
    return { ok: false, formError: "Could not update verification status." };
  }

  // If there's an open pending request, mark it resolved
  await supabase
    .from("verification_requests")
    .update({
      status: isVerifying ? "approved" : "rejected",
      reviewed_by: verifier.id,
      reviewed_at: new Date().toISOString(),
      review_notes: isVerifying ? `Verified as ${tier}` : "Verification revoked",
    })
    .eq("user_id", parsed.data.memberId)
    .eq("status", "pending");

  // Audit log
  await supabase.rpc("log_admin_action", {
    p_action: isVerifying ? `verify_member_${tier}` : "unverify_member",
    p_entity_type: "profile",
    p_entity_id: parsed.data.memberId,
    p_metadata: {
      verifier_username: verifier.profile?.username ?? "verifier",
      tier: tier ?? undefined,
    },
  });

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  revalidatePath("/verification");
  return { ok: true };
}

export async function toggleVerificationDelegateAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  // Only platform Admin (you) can delegate or revoke verification authority
  const admin = await requireAdmin();

  const parsed = toggleVerificationDelegateSchema.safeParse({
    memberId: formData.get("memberId"),
    intent: formData.get("intent"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid delegation parameters." };
  }

  const supabase = await createClient();

  if (parsed.data.intent === "delegate") {
    const { error } = await supabase.from("verification_delegates").upsert({
      user_id: parsed.data.memberId,
      delegated_by: admin.id,
      delegated_at: new Date().toISOString(),
      notes: parsed.data.notes || null,
    });

    if (error) {
      console.error("[admin.delegate] failed", error.message);
      return { ok: false, formError: "Could not delegate verification authority." };
    }
  } else {
    const { error } = await supabase
      .from("verification_delegates")
      .delete()
      .eq("user_id", parsed.data.memberId);

    if (error) {
      console.error("[admin.undelegate] failed", error.message);
      return { ok: false, formError: "Could not revoke verification delegation." };
    }
  }

  // Audit log
  await supabase.rpc("log_admin_action", {
    p_action: parsed.data.intent === "delegate" ? "delegate_verifier" : "revoke_verifier",
    p_entity_type: "profile",
    p_entity_id: parsed.data.memberId,
    p_metadata: {
      admin_username: admin.profile?.username ?? "admin",
      notes: parsed.data.notes || undefined,
    },
  });

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { ok: true };
}

export async function reviewVerificationRequestAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const verifier = await requireVerifier();

  const parsed = reviewVerificationRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    tier: formData.get("tier") || undefined,
    reviewNotes: formData.get("reviewNotes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid review parameters." };
  }

  const supabase = await createClient();

  // 1. Fetch the request
  const { data: request, error: fetchError } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("id", parsed.data.requestId)
    .single();

  if (fetchError || !request) {
    return { ok: false, formError: "Verification request not found." };
  }

  const isApproved = parsed.data.decision === "approve";
  const tier: VerificationType =
    (parsed.data.tier as VerificationType) || (request.tier as VerificationType) || "blue";

  // 2. Update the request status
  const { error: updateReqError } = await supabase
    .from("verification_requests")
    .update({
      status: isApproved ? "approved" : "rejected",
      reviewed_by: verifier.id,
      reviewed_at: new Date().toISOString(),
      review_notes: parsed.data.reviewNotes || null,
    })
    .eq("id", parsed.data.requestId);

  if (updateReqError) {
    console.error("[admin.review_request] failed", updateReqError.message);
    return { ok: false, formError: "Could not update verification request." };
  }

  // 3. If approved, update member profile
  if (isApproved) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        verification_type: tier,
      })
      .eq("id", request.user_id);

    if (profileError) {
      console.error("[admin.review_request.profile] failed", profileError.message);
      return { ok: false, formError: "Request status updated, but profile could not be marked verified." };
    }
  }

  // Audit log
  await supabase.rpc("log_admin_action", {
    p_action: isApproved ? `approve_verification_${tier}` : "reject_verification",
    p_entity_type: "verification_request",
    p_entity_id: parsed.data.requestId,
    p_metadata: {
      verifier_username: verifier.profile?.username ?? "verifier",
      user_id: request.user_id,
      tier,
    },
  });

  revalidatePath("/admin/members");
  revalidatePath("/verification");
  return { ok: true };
}

export async function toggleSuspensionAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = toggleSuspensionSchema.safeParse({
    memberId: formData.get("memberId"),
    intent: formData.get("intent"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid request." };
  }

  const isSuspending = parsed.data.intent === "suspend";
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      is_suspended: isSuspending,
      suspended_until: null,
    })
    .eq("id", parsed.data.memberId);

  if (error) {
    console.error("[admin.suspend] failed", error.message);
    return { ok: false, formError: "Could not update suspension status." };
  }

  // Audit log
  await supabase.rpc("log_admin_action", {
    p_action: isSuspending ? "suspend_member" : "reinstate_member",
    p_entity_type: "profile",
    p_entity_id: parsed.data.memberId,
    p_metadata: {
      admin_username: admin.profile?.username ?? "admin",
      reason: parsed.data.reason || undefined,
    },
  });

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminUpdateIssueStatusAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const staff = await requireStaff();

  const parsed = adminIssueStatusSchema.safeParse({
    issueId: formData.get("issueId"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid status parameters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("community_issues")
    .update({
      status: parsed.data.status,
      status_note: parsed.data.note || null,
    })
    .eq("id", parsed.data.issueId);

  if (error) {
    console.error("[admin.issue.status] failed", error.message);
    return { ok: false, formError: "Could not update issue status." };
  }

  // Audit log
  await supabase.rpc("log_admin_action", {
    p_action: "update_issue_status",
    p_entity_type: "community_issue",
    p_entity_id: parsed.data.issueId,
    p_metadata: {
      status: parsed.data.status,
      note: parsed.data.note,
      staff_username: staff.profile?.username ?? "staff",
    },
  });

  revalidatePath("/admin/issues");
  revalidatePath("/issues");
  revalidatePath(`/issues/${parsed.data.issueId}`);
  return { ok: true };
}
