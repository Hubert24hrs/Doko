import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, ProfileSocialLinkRow } from "@/types/database";
import { PROFILE_FIELDS } from "./fields";

export interface PublicProfile extends ProfileRow {
  socialLinks: ProfileSocialLinkRow[];
  /** Names resolved for display; null when not set or not readable. */
  villageName: string | null;
  townName: string | null;
}

/**
 * A member's profile by username.
 *
 * Returns null when the profile does not exist OR when this caller may not see
 * it. Those two cases are deliberately indistinguishable: the page 404s either
 * way, so a private profile does not confirm its own existence to a stranger
 * probing usernames.
 *
 * No visibility filtering appears in the query. The profiles policies already
 * express it -- public to everyone, community-only to people who share a
 * community, private to its owner -- and restating it here would be a second
 * copy to drift.
 */
export const getProfileByUsername = cache(
  async (username: string): Promise<PublicProfile | null> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("profiles")
        .select(
          `${PROFILE_FIELDS},
           village:village_id ( name ),
           town:town_id ( name )`,
        )
        .eq("username", username)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        console.error("[profile.getByUsername] failed", error.message);
        return null;
      }
      if (!data) return null;

      type Embedded = ProfileRow & {
        village: { name: string } | null;
        town: { name: string } | null;
      };
      const row = data as unknown as Embedded;

      // Social links are readable exactly when the profile is, enforced by
      // their own policy rather than by asking again here.
      const { data: links, error: linkError } = await supabase
        .from("profile_social_links")
        .select("*")
        .eq("profile_id", row.id);

      if (linkError) {
        console.error("[profile.getByUsername] links failed", linkError.message);
      }

      return {
        ...row,
        socialLinks: (links ?? []) as ProfileSocialLinkRow[],
        villageName: row.village?.name ?? null,
        townName: row.town?.name ?? null,
      };
    } catch (cause) {
      console.error("[profile.getByUsername] unavailable", cause);
      return null;
    }
  },
);

/**
 * The signed-in member's own contact details.
 *
 * Goes through `ezo_my_contact()`, which reads `auth.uid()` itself and takes
 * no parameter — a function accepting an id would reopen the hole the column
 * revoke closes. Returns nulls rather than throwing, so a missing function
 * leaves the settings form blank instead of breaking the page.
 */
export async function getMyContact(): Promise<{
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
}> {
  const empty = { email: null, phone: null, date_of_birth: null };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ezo_my_contact");

    if (error) {
      console.error("[profile.getMyContact] failed", error.message);
      return empty;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      email: row?.email ?? null,
      phone: row?.phone ?? null,
      date_of_birth: row?.date_of_birth ?? null,
    };
  } catch {
    return empty;
  }
}
