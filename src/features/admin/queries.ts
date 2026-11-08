import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AuditLogRow,
  ReadableProfile,
  CommunityIssueRow,
  VerificationRequestRow,
} from "@/types/database";
import { PROFILE_FIELDS } from "@/features/profile/fields";

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

export interface AdminMemberItem extends ReadableProfile {
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
          // `id`, not `*`: a wildcard expands to the revoked contact columns
          // and is refused even for a head-only count.
          .select("id", { count: "exact", head: true })
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
          .select("id", { count: "exact", head: true })
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

    // `roles:user_roles ( role )` used to be embedded here and it broke the
    // whole page. PostgREST can only embed across a declared foreign key, and
    // `user_roles.user_id` references `auth.users`, not `public.profiles` --
    // so the request failed with PGRST200, the catch returned [], and the
    // admin screen showed "All Members 0" while the database held every one
    // of them. An embed that cannot resolve does not degrade; it takes the
    // entire query with it. Roles are fetched separately below.
    let q = supabase
      .from("profiles")
      .select(`
        ${PROFILE_FIELDS},
        village:village_id ( name )
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

    const memberIds = members.map((m) => m.id);

    const [{ data: delegates }, { data: roleRows }] = await Promise.all([
      supabase.from("verification_delegates").select("user_id").in("user_id", memberIds),
      supabase.from("user_roles").select("user_id, role").in("user_id", memberIds),
    ]);

    const delegateSet = new Set((delegates ?? []).map((d) => d.user_id));

    const rolesByUser = new Map<string, { role: string }[]>();
    for (const row of roleRows ?? []) {
      const list = rolesByUser.get(row.user_id) ?? [];
      list.push({ role: row.role });
      rolesByUser.set(row.user_id, list);
    }

    return members.map((m) => ({
      ...m,
      roles: rolesByUser.get(m.id) ?? [],
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

    // Same trap as the member list: `profile:user_id ( … )` cannot be embedded
    // because `verification_requests.user_id` references `auth.users`, not
    // `public.profiles`. The request failed with PGRST200 and the page said
    // "No pending verification requests" while a member sat waiting in the
    // table. The applicant's profile is fetched separately.
    const { data, error } = await supabase
      .from("verification_requests")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[admin.verification_requests] failed", error.message);
      return [];
    }

    const requests = (data ?? []) as unknown as AdminVerificationRequestItem[];
    if (requests.length === 0) return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_path")
      .in("id", requests.map((r) => r.user_id));

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    return requests.map((request) => ({
      ...request,
      profile: byId.get(request.user_id) ?? null,
    }));
  } catch (cause) {
    console.error("[admin.verification_requests] unavailable", cause);
    return [];
  }
}
