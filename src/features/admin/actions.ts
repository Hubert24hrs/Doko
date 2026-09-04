"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/features/auth/session";
import {
  toggleVerificationSchema,
  toggleSuspensionSchema,
  adminIssueStatusSchema,
} from "./schemas";

export interface AdminActionState {
  ok: boolean;
  formError?: string;
}

export async function toggleVerificationAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = toggleVerificationSchema.safeParse({
    memberId: formData.get("memberId"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "Invalid request." };
  }

  const isVerifying = parsed.data.intent === "verify";
  const supabase = await createClient();

  // Profiles check constraint requires (is_verified = false and verified_at is null) or (is_verified = true and verified_at is not null)
  const { error } = await supabase
    .from("profiles")
    .update({
      is_verified: isVerifying,
      verified_at: isVerifying ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.memberId);

  if (error) {
    console.error("[admin.verify] failed", error.message);
    return { ok: false, formError: "Could not update verification status." };
  }

  // Audit log
  await supabase.rpc("log_admin_action", {
    p_action: isVerifying ? "verify_member" : "unverify_member",
    p_entity_type: "profile",
    p_entity_id: parsed.data.memberId,
    p_metadata: { admin_username: admin.profile?.username ?? "admin" },
  });

  revalidatePath("/admin/members");
  revalidatePath("/admin");
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
