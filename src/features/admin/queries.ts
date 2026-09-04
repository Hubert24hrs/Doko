import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AuditLogRow, ProfileRow, CommunityIssueRow, VerificationRequestRow } from "@/types/database";

export interface AdminOverview {
  memberCount: number | null;
  geoCount: number | null;
  verifiedCount: number | null;
  issueCount: number | null;
  auditCount: number | null;
  recentAudits: Pick<
    AuditLogRow,
    "id" | "actor_username" | "action" | "entity_type" | "created_at"
  >[];
}

export interface AdminMemberItem extends ProfileRow {
  village?: { name: string } | null;
  roles?: { role: string }[];
  is_delegate?: boolean;
}

export interface AdminVerificationRequestItem extends VerificationRequestRow {
  profile?: {
    username: string;
    full_name: string;
    avatar_path: string | null;
  } | null;
}

export interface AdminIssueItem extends CommunityIssueRow {
  community?: { name: string } | null;
  reporter?: { username: string; full_name: string } | null;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function settleCount(
  label: string,
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (cause) {
    console.error(`[admin.overview] ${label} count failed`, cause);
    return null;
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const [memberCount, geoCount, verifiedCount, issueCount, auditCount, recentAudits] =
    await Promise.all([
      settleCount("members", () =>
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null),
      ),
      settleCount("geo entities", () =>
        supabase
          .from("geo_entities")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null),
      ),
      settleCount("verified members", () =>
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("is_verified", true)
          .is("deleted_at", null),
      ),
      settleCount("community issues", () =>
        supabase
          .from("community_issues")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null),
      ),
      settleCount("audit entries", () =>
        supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      ),
      recentAuditEntries(supabase),
    ]);

  return { memberCount, geoCount, verifiedCount, issueCount, auditCount, recentAudits };
}

async function recentAuditEntries(
  supabase: SupabaseServerClient,
): Promise<AdminOverview["recentAudits"]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, actor_username, action, entity_type, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[admin.overview] audit query failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function getAdminMembers(options?: {
  query?: string;
  verified?: boolean;
  suspended?: boolean;
  limit?: number;
}): Promise<AdminMemberItem[]> {
  try {
    const supabase = await createClient();
    const limit = options?.limit ?? 50;

    let q = supabase
      .from("profiles")
      .select(`
        *,
        village:village_id ( name ),
        roles:user_roles ( role )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options?.query) {
      const escaped = options.query.trim().replace(/[%_]/g, "\\$&");
      q = q.or(`full_name.ilike.%${escaped}%,username.ilike.%${escaped}%`);
    }

    if (options?.verified !== undefined) {
      q = q.eq("is_verified", options.verified);
    }

    if (options?.suspended !== undefined) {
      q = q.eq("is_suspended", options.suspended);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[admin.members] failed", error.message);
      return [];
    }

    const members = (data ?? []) as unknown as AdminMemberItem[];
    if (members.length === 0) return [];

    // Check which members are delegated verifiers
    const memberIds = members.map((m) => m.id);
    const { data: delegates } = await supabase
      .from("verification_delegates")
      .select("user_id")
      .in("user_id", memberIds);

    const delegateSet = new Set((delegates ?? []).map((d) => d.user_id));
    return members.map((m) => ({
      ...m,
      is_delegate: delegateSet.has(m.id),
    }));
  } catch (cause) {
    console.error("[admin.members] unavailable", cause);
    return [];
  }
}

export async function getAdminIssues(options?: {
  category?: string;
  status?: string;
  limit?: number;
}): Promise<AdminIssueItem[]> {
  try {
    const supabase = await createClient();
    const limit = options?.limit ?? 100;

    let q = supabase
      .from("community_issues")
      .select(`
        *,
        community:geo_id ( name ),
        reporter:reporter_id ( username, full_name )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (options?.category) q = q.eq("category", options.category as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (options?.status) q = q.eq("status", options.status as any);

    const { data, error } = await q;
    if (error) {
      console.error("[admin.issues] failed", error.message);
      return [];
    }

    return (data ?? []) as unknown as AdminIssueItem[];
  } catch (cause) {
    console.error("[admin.issues] unavailable", cause);
    return [];
  }
}

export async function getAdminAudits(limit = 50): Promise<AuditLogRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[admin.audits] failed", error.message);
      return [];
    }
    return data ?? [];
  } catch (cause) {
    console.error("[admin.audits] unavailable", cause);
    return [];
  }
}

export async function getAdminVerificationRequests(options?: {
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}): Promise<AdminVerificationRequestItem[]> {
  try {
    const supabase = await createClient();
    const limit = options?.limit ?? 50;
    const status = options?.status ?? "pending";

    const { data, error } = await supabase
      .from("verification_requests")
      .select(`
        *,
        profile:user_id ( username, full_name, avatar_path )
      `)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[admin.verification_requests] failed", error.message);
      return [];
    }

    return (data ?? []) as unknown as AdminVerificationRequestItem[];
  } catch (cause) {
    console.error("[admin.verification_requests] unavailable", cause);
    return [];
  }
}
