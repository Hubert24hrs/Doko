import type { MetadataRoute } from "next";

import { createAnonymousClient } from "@/lib/supabase/server";

/**
 * Sitemap covering the pages a search engine can actually reach.
 *
 * Public posts are included because they are genuinely public pages with their
 * own metadata. They are fetched with the ANONYMOUS client, which carries no
 * cookies: RLS then applies as the anonymous role, so what the sitemap lists
 * is exactly what a signed-out crawler can reach, with no separate "is this
 * public" filter that could disagree with the policies.
 *
 * Using the request-scoped client here read cookies, which made the route
 * dynamic — it could not be cached, and the post query failed during the
 * build, silently shipping a sitemap containing only the static pages.
 *
 * Capped rather than unbounded. A sitemap is a discovery aid, not an archive,
 * and search engines cap them anyway. Once the platform has more posts than
 * this, the right answer is a sitemap index, not a bigger single file.
 */
const MAX_POSTS = 1000;

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/communities`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  try {
    const supabase = createAnonymousClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, created_at, updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_POSTS);

    if (error) {
      console.error("[sitemap] post query failed", error.message);
      return staticEntries;
    }

    // Profiles too. Same anonymous client, so RLS returns only the ones a
    // signed-out crawler could actually read.
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("username, updated_at")
      .is("deleted_at", null)
      .eq("is_suspended", false)
      .order("updated_at", { ascending: false })
      .limit(MAX_POSTS);

    if (profileError) {
      console.error("[sitemap] profile query failed", profileError.message);
    }

    return [
      ...staticEntries,
      ...(data ?? []).map((post) => ({
        url: `${siteUrl}/posts/${post.id}`,
        lastModified: new Date(post.updated_at ?? post.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...(profiles ?? []).map((p) => ({
        url: `${siteUrl}/members/${p.username}`,
        lastModified: new Date(p.updated_at),
        changeFrequency: "monthly" as const,
        priority: 0.4,
      })),
    ];
  } catch (cause) {
    // A sitemap that fails to build must not take the deployment down. The
    // static entries are always correct.
    console.error("[sitemap] unavailable", cause);
    return staticEntries;
  }
}
