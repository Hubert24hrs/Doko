import "server-only";

import { z } from "zod";

import { publicEnvSchema } from "./env";

/**
 * Server-only environment. The `server-only` import above makes bundling this
 * module into a Client Component a hard build error, which is the mechanism
 * that keeps the service-role key out of the browser.
 */

const serverSchema = publicEnvSchema.extend({
  /**
   * Bypasses RLS entirely. Used only by deliberate, audited server paths
   * (seeding, admin backfills, webhooks). Never in request handling that acts
   * on behalf of a user — those use the request-scoped client so RLS applies.
   */
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required on the server")
    .optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_OAUTH_PROVIDERS: process.env.NEXT_PUBLIC_OAUTH_PROVIDERS,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment configuration.\n${issues}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Explicit accessor for the service-role key so every privileged use is easy
 * to grep for in a security review.
 */
export function requireServiceRoleKey(): string {
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. This operation requires " +
        "privileged database access.",
    );
  }
  return key;
}
