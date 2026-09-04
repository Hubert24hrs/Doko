import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

export interface DirectoryEntry {
  id: string;
  username: string;
  full_name: string;
  avatar_path: string | null;
  bio: string | null;
  occupation: string | null;
  is_verified: boolean;
  verification_type?: "blue" | "gold" | null;
  villageName: string | null;
  townName: string | null;
}

export interface DirectoryPage {
  members: DirectoryEntry[];
  /** `<full_name>|<id>`, opaque to the caller. See searchDirectory for why. */
  nextCursor: string | null;
  available: boolean;
}

/**
 * Encodes a `(full_name, id)` position as one opaque string, and decodes it
 * back.
 *
 * A plain `full_name` cursor is not enough: two members can share a full
 * name, and comparing only on it would let a keyset page skip or repeat a row
 * exactly the way OFFSET does -- the failure mode this pagination style
 * exists to avoid. `id` breaks the tie.
 */
function encodeCursor(fullName: string, id: string): string {
  return `${fullName}|${id}`;
}

function decodeCursor(cursor: string): { fullName: string; id: string } | null {
  const sep = cursor.lastIndexOf("|");
  if (sep < 1 || sep === cursor.length - 1) return null;
  return { fullName: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

export const DIRECTORY_PAGE_SIZE = 24;

/**
 * Wraps a search term in SQL ILIKE wildcards and escapes the characters that
 * have special meaning inside a LIKE pattern (%, _, \).
 *
 * Supabase's `.ilike()` filter accepts a raw pattern string, so the caller is
 * responsible for escaping. Without this, a search for "50%" would treat % as
 * a wildcard and match everything.
 */
function likePattern(term: string): string {
  const escaped = term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${escaped}%`;
}

/**
 * Members findable in the directory, alphabetically.
 *
 * No new table and no new policy. `profiles` already carries exactly the
 * visibility rule a directory needs -- public to everyone, `community` only
 * to people who share a community, `private` to nobody -- so this queries the
 * table plainly and lets RLS decide what comes back. A second copy of that
 * rule here, to "only show public profiles in the directory", would in fact
 * be a NARROWER rule than the one profiles already enforce, hiding
 * community-tier neighbours from each other for no reason.
 *
 * `q` searches name and occupation with `ilike`, which is a sequential scan
 * without a trigram index -- acceptable at this membership size, and the
 * first thing to revisit if the directory ever feels slow.
 */
export async function searchDirectory(
  options: {
    q?: string;
    geoId?: string;
    cursor?: string;
  } = {},
): Promise<DirectoryPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("profiles")
      .select(
        `id, username, full_name, avatar_path, bio, occupation, is_verified, verification_type,
         village:village_id ( name ), town:town_id ( name )`,
      )
      .is("deleted_at", null)
      .eq("is_suspended", false)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .limit(DIRECTORY_PAGE_SIZE);

    if (options.q) {
      const pattern = likePattern(options.q);
      query = query.or(
        `full_name.ilike.${pattern},occupation.ilike.${pattern}`,
      );
    }
    if (options.geoId) {
      // Any of the three tiers: a member's village, community or town may
      // equal the chosen entity, so a town filter also surfaces its villages'
      // members rather than only people whose town_id was set directly.
      query = query.or(
        `village_id.eq.${options.geoId},community_id.eq.${options.geoId},town_id.eq.${options.geoId}`,
      );
    }
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        const escapedName = decoded.fullName.replace(/[(),]/g, "\\$&");
        query = query.or(
          `full_name.gt.${escapedName},and(full_name.eq.${escapedName},id.gt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error("[directory.search] failed", error.message);
      return { members: [], nextCursor: null, available: false };
    }

    type Embedded = Pick<
      ProfileRow,
      "id" | "username" | "full_name" | "avatar_path" | "bio" | "occupation" | "is_verified" | "verification_type"
    > & {
      village: { name: string } | null;
      town: { name: string } | null;
    };

    const rows = (data ?? []) as unknown as Embedded[];
    const members: DirectoryEntry[] = rows.map((r) => ({
      id: r.id,
      username: r.username,
      full_name: r.full_name,
      avatar_path: r.avatar_path,
      bio: r.bio,
      occupation: r.occupation,
      is_verified: r.is_verified,
      verification_type: r.verification_type,
      villageName: r.village?.name ?? null,
      townName: r.town?.name ?? null,
    }));

    const last = members[members.length - 1];
    const nextCursor =
      members.length === DIRECTORY_PAGE_SIZE
        ? encodeCursor(last.full_name, last.id)
        : null;

    return { members, nextCursor, available: true };
  } catch (cause) {
    console.error("[directory.search] unavailable", cause);
    return { members: [], nextCursor: null, available: false };
  }
}

