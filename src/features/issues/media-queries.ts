import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { IssueMediaRow } from "@/types/database";

export interface IssueImage {
  id: string;
  /** Short-lived signed URL. Null when one could not be minted. */
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

/** Same TTL as post images, for the same reason: see features/posts/media-queries.ts. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Images for a set of issues, keyed by issue id. One query, one batch sign. */
export async function getIssueImages(
  issueIds: string[],
): Promise<Map<string, IssueImage[]>> {
  const byIssue = new Map<string, IssueImage[]>();
  if (issueIds.length === 0) return byIssue;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("issue_media")
      .select("id, issue_id, storage_path, alt_text, width, height, sort_order")
      .in("issue_id", issueIds)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[issues.media.get] query failed", error.message);
      return byIssue;
    }

    const rows = (data ?? []) as Pick<
      IssueMediaRow,
      "id" | "issue_id" | "storage_path" | "alt_text" | "width" | "height" | "sort_order"
    >[];
    if (rows.length === 0) return byIssue;

    const { data: signed, error: signError } = await supabase.storage
      .from("issue-media")
      .createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );

    if (signError) {
      console.error("[issues.media.get] signing failed", signError.message);
    }

    const urlByPath = new Map<string, string>();
    for (const entry of signed ?? []) {
      if (entry.error || !entry.signedUrl) {
        console.error("[issues.media.get] could not sign", entry.path, entry.error);
        continue;
      }
      if (entry.path) urlByPath.set(entry.path, entry.signedUrl);
    }

    for (const row of rows) {
      const list = byIssue.get(row.issue_id) ?? [];
      list.push({
        id: row.id,
        url: urlByPath.get(row.storage_path) ?? null,
        altText: row.alt_text,
        width: row.width,
        height: row.height,
      });
      byIssue.set(row.issue_id, list);
    }

    return byIssue;
  } catch (cause) {
    console.error("[issues.media.get] unavailable", cause);
    return byIssue;
  }
}
