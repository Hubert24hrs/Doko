import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Routes that require a signed-in member. Matched by prefix.
 *
 * This is a redirect convenience, not the authorization boundary — the
 * database enforces access with RLS regardless of what this proxy does.
 */
const PROTECTED_PREFIXES = [
  "/home",
  "/welcome",
  "/feed",
  "/my-community",
  "/messages",
  // Only the composer. /events and /events/[id] are public pages, like the
  // communities directory, and RLS decides what a signed-out reader sees.
  "/events/new",
  "/jobs/new",
  "/marketplace/new",
  "/groups",
  "/issues",
  "/notifications",
  "/bookmarks",
  "/settings",
  "/admin",
] as const;

/** Signed-in members are bounced away from these. */
const AUTH_ONLY_PREFIXES = ["/login", "/register"] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (user && matchesPrefix(pathname, AUTH_ONLY_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /**
   * Skips static assets and image files. The session still refreshes on every
   * real navigation and API call.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
