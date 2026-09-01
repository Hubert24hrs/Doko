import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getClientEnv } from "@/lib/env";
import { requireServiceRoleKey } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Request-scoped Supabase client for Server Components, Route Handlers and
 * Server Actions.
 *
 * Uses the anon key plus the caller's session cookie, so RLS applies exactly
 * as it would in the browser. This is the client almost all server code wants.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Refresh is handled by the
            // middleware instead, so this is safe to ignore here.
          }
        },
      },
    },
  );
}

/**
 * Anonymous client: the anon key, and no cookies at all.
 *
 * For request-independent work such as the sitemap, where there is no caller
 * to act on behalf of. Reading cookies there would be both meaningless and
 * harmful — it makes the route dynamic, so it cannot be cached, and it would
 * tie a shared artefact to whichever session happened to trigger the build.
 *
 * RLS still applies, as the anonymous role. For a sitemap that is exactly
 * right: what it lists is precisely what a signed-out crawler can reach, with
 * no separate "is this public" filter that could disagree with the policies.
 */
export function createAnonymousClient() {
  const env = getClientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * Service-role client. Bypasses RLS completely.
 *
 * Only for deliberate privileged operations — seeding, backfills, webhook
 * handlers that have already authenticated their caller by other means. Never
 * use it to serve a user request: that would silently discard every
 * authorization rule in the database.
 */
export function createAdminClient() {
  const env = getClientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    requireServiceRoleKey(),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Never writes auth cookies: this client has no user session.
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
