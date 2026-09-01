import type { MetadataRoute } from "next";

/**
 * Crawl rules.
 *
 * Public community pages are the point of being indexable, so they are open.
 * Everything behind sign-in is disallowed — not as a security control (RLS is
 * that, and a crawler has no session anyway) but because those URLs are
 * useless in a search result and would only produce sign-in redirects.
 *
 * /posts/ and /members/ are deliberately allowed: a public post and a public
 * profile are public pages with real metadata. RLS still hides community-only
 * and private ones from an anonymous crawler, and those pages carry
 * `robots: noindex` regardless.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/communities", "/posts/", "/members/"],
        disallow: [
          "/admin",
          "/admin/",
          "/settings",
          "/home",
          "/feed",
          "/welcome",
          "/login",
          "/register",
          "/auth/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
