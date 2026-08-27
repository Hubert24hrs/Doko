import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AuditLogRow } from "@/types/database";

export interface AdminOverview {
  memberCount: number | null;
  geoCount: number | null;
  verifiedCount: number | null;
  auditCount: number | null;
  recentAudits: Pick<
    AuditLogRow,
    "id" | "actor_username" | "action" | "entity_type" | "created_at"
  >[];
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A failed count yields null (rendered as an em dash) rather than 0, so a
 * broken query never masquerades as "no members".
 */
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

/**
 * Counts for the admin landing page.
 *
 * Every query runs as the calling admin, so RLS still applies: a moderator
 * sees exactly what their policies permit. Counts use HEAD requests, so no row
 * data crosses the wire.
 */
export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const [memberCount, geoCount, verifiedCount, auditCount, recentAudits] =
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
      settleCount("audit entries", () =>
        supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      ),
      recentAuditEntries(supabase),
    ]);

  return { memberCount, geoCount, verifiedCount, auditCount, recentAudits };
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
