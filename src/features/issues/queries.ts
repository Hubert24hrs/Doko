import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CommunityIssueRow,
  IssueCategory,
  IssueStatus,
} from "@/types/database";

export interface IssueSummary extends CommunityIssueRow {
  reporter: {
    username: string;
    full_name: string;
    is_verified: boolean;
  } | null;
  community: { name: string; slug: string } | null;
}

export interface IssueDetail extends IssueSummary {
  /** Whether the caller has already confirmed they see this. */
  viewerConfirmed: boolean;
  /** Whether the caller may move its status. */
  viewerAdministers: boolean;
}

export interface IssuePage {
  issues: IssueSummary[];
  nextCursor: string | null;
  available: boolean;
}

export const ISSUES_PAGE_SIZE = 20;

const ISSUE_FIELDS = `
  id, title, description, category, geo_id, location_text, latitude, longitude,
  reporter_id, status, status_note, status_changed_by, status_changed_at,
  resolved_at, confirm_count, created_at, updated_at, edited_at, deleted_at,
  reporter:reporter_id ( username, full_name, is_verified ),
  community:geo_id ( name, slug )
`;

/**
 * Reported issues, newest first.
 *
 * Resolved ones are NOT filtered out by default. A community's record of what
 * was fixed is the evidence that reporting works at all -- hide it and the
 * page reads as a permanent list of complaints nobody ever acts on.
 */
export async function getIssues(
  cursor?: string,
  options?: { category?: IssueCategory; status?: IssueStatus; geoId?: string },
): Promise<IssuePage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("community_issues")
      .select(ISSUE_FIELDS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ISSUES_PAGE_SIZE);

    if (cursor) query = query.lt("created_at", cursor);
    if (options?.category) query = query.eq("category", options.category);
    if (options?.status) query = query.eq("status", options.status);
    if (options?.geoId) query = query.eq("geo_id", options.geoId);

    const { data, error } = await query;
    if (error) {
      console.error("[issues.list] failed", error.message);
      return { issues: [], nextCursor: null, available: false };
    }

    const issues = (data ?? []) as unknown as IssueSummary[];
    const nextCursor =
      issues.length === ISSUES_PAGE_SIZE
        ? issues[issues.length - 1].created_at
        : null;

    return { issues, nextCursor, available: true };
  } catch (cause) {
    console.error("[issues.list] unavailable", cause);
    return { issues: [], nextCursor: null, available: false };
  }
}

/** Issues carrying a map pin. The map reads nothing else. */
export async function getMappedIssues(): Promise<IssueSummary[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_issues")
      .select(ISSUE_FIELDS)
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[issues.mapped] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as IssueSummary[];
  } catch (cause) {
    console.error("[issues.mapped] unavailable", cause);
    return [];
  }
}

export async function getIssue(issueId: string): Promise<IssueDetail | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("community_issues")
      .select(ISSUE_FIELDS)
      .eq("id", issueId)
      .maybeSingle();

    if (error) {
      console.error("[issues.get] failed", error.message);
      return null;
    }
    if (!data) return null;

    const issue = data as unknown as IssueSummary;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let viewerConfirmed = false;
    let viewerAdministers = false;

    if (user) {
      const [{ data: confirmation }, { data: administers }] = await Promise.all([
        supabase
          .from("issue_confirmations")
          .select("issue_id")
          .eq("issue_id", issueId)
          .eq("user_id", user.id)
          .maybeSingle(),
        // Asked of the database rather than worked out here: the rule walks
        // the geographic ancestors, so a town's admin covers every village
        // beneath it and no copy of that walk belongs in this file.
        supabase.rpc("administers_issue", { target_issue_id: issueId }),
      ]);

      viewerConfirmed = Boolean(confirmation);
      viewerAdministers = administers === true;
    }

    return { ...issue, viewerConfirmed, viewerAdministers };
  } catch (cause) {
    console.error("[issues.get] unavailable", cause);
    return null;
  }
}

/** How many issues sit at each status, for the filter row. */
export async function getIssueCounts(): Promise<Record<string, number> | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_issues")
      .select("status")
      .is("deleted_at", null)
      .limit(1000);

    if (error) {
      // Null, not an empty object. A failed count must not render as "0 open
      // issues", which is a claim rather than an absence.
      console.error("[issues.counts] failed", error.message);
      return null;
    }

    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { status: string }[]) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  } catch (cause) {
    console.error("[issues.counts] unavailable", cause);
    return null;
  }
}
