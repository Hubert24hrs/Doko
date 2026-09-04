import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/features/auth/session";
import type { VerificationRequestRow, VerificationType } from "@/types/database";

export interface MemberVerificationStatus {
  isVerified: boolean;
  verificationType: VerificationType | null;
  verifiedAt: string | null;
  isDelegate: boolean;
  pendingRequest: VerificationRequestRow | null;
}

export async function getMyVerificationStatus(): Promise<MemberVerificationStatus | null> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  const supabase = await createClient();

  const [{ data: profile }, { data: pendingRequests }, { data: delegateRecord }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("is_verified, verified_at, verification_type")
        .eq("id", sessionUser.id)
        .maybeSingle(),
      supabase
        .from("verification_requests")
        .select("*")
        .eq("user_id", sessionUser.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("verification_delegates")
        .select("user_id")
        .eq("user_id", sessionUser.id)
        .maybeSingle(),
    ]);

  return {
    isVerified: Boolean(profile?.is_verified),
    verificationType: (profile?.verification_type as VerificationType) ?? null,
    verifiedAt: profile?.verified_at ?? null,
    isDelegate: Boolean(delegateRecord),
    pendingRequest: pendingRequests?.[0] ?? null,
  };
}
