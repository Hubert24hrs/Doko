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
