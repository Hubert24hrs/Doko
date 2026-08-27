import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { tryGetClientEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase auth session on every matched request and writes the
 * rotated cookies onto the outgoing response.
 *
 * Without this, an expired access token would only be refreshed in the
 * browser, and Server Components would keep seeing a signed-out user.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
}> {
  let response = NextResponse.next({ request });

  // Not configured yet (fresh clone, preview deploy missing variables).
  // Treat the caller as signed out rather than throwing: a missing variable
  // must not turn every public route into a 500.
  const env = tryGetClientEnv();
  if (!env) {
    return { response, user: null };
  }

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), not getSession(): getUser() revalidates the JWT with the auth
  // server, so a revoked or tampered token is actually rejected. getSession()
  // trusts whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    response,
    user: user ? { id: user.id, email: user.email } : null,
  };
}
