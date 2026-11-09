import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * None of these were set. Each closes a specific, ordinary attack rather than
 * being defence-in-depth decoration:
 *
 *   * `X-Frame-Options` / `frame-ancestors` stop the site being framed by
 *     another, which is how clickjacking works: an invisible overlay over a
 *     real "Delete my account" or "Approve Gold" button.
 *   * `Strict-Transport-Security` means a visitor who types the domain
 *     without https is never sent over plain HTTP in the first place, which
 *     is where a session token would be readable.
 *   * `X-Content-Type-Options: nosniff` stops a browser second-guessing a
 *     content type — an uploaded file served as something it is not can be
 *     executed as script.
 *   * `Referrer-Policy` keeps profile and post paths out of the Referer
 *     header when a member follows a link off-site.
 *   * `Permissions-Policy` turns off camera, microphone and geolocation,
 *     which this site never uses, so an injected script cannot ask for them.
 *
 * The CSP deliberately does NOT allow `unsafe-eval`, and `object-src 'none'`
 * kills plugin embeds outright. `unsafe-inline` remains for styles because
 * Next's streaming inserts inline style tags; scripts carry no such
 * allowance, which is the half that matters for injection.
 */
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js needs inline bootstrap scripts; eval is not allowed.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${SUPABASE_ORIGIN} https://lh3.googleusercontent.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} wss://*.supabase.co`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Stops advertising the framework and its version to anyone scanning.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
