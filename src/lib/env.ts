import { z } from "zod";

/**
 * Environment configuration.
 *
 * Two separate schemas on purpose. `serverEnv` may hold secrets and is only
 * ever imported from server code; `clientEnv` holds the NEXT_PUBLIC_ values
 * that Next.js inlines into the browser bundle.
 *
 * Importing `serverEnv` from a Client Component is a build-time error, because
 * the `server-only` guard in ./env.server.ts poisons that import graph.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("NEXT_PUBLIC_SITE_URL must be a valid URL")
    .default("http://localhost:3000"),

  /**
   * Which identity providers to offer, comma separated.
   *
   * Configuration rather than code because enabling a provider is an account
   * and billing decision, not an engineering one. Apple is omitted by default:
   * Sign in with Apple requires paid Apple Developer Program membership, and a
   * button that always fails is worse than no button. Add "apple" here once
   * that membership exists -- no code change, no redeploy of logic.
   */
  NEXT_PUBLIC_OAUTH_PROVIDERS: z
    .string()
    // Defaults to NONE, not to google. An absent variable -- a deploy where
    // someone forgot to set it -- must not silently surface a provider button
    // that has no credentials behind it. Opting in is explicit.
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter((p): p is "google" | "apple" => p === "google" || p === "apple"),
    ),
});

export type ClientEnv = z.infer<typeof publicSchema>;

/**
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when the property is
 * referenced statically, so these cannot be read through a dynamic key.
 */
function readPublicEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_OAUTH_PROVIDERS: process.env.NEXT_PUBLIC_OAUTH_PROVIDERS,
  };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

let cachedClientEnv: ClientEnv | null = null;

export function getClientEnv(): ClientEnv {
  if (cachedClientEnv) return cachedClientEnv;

  const parsed = publicSchema.safeParse(readPublicEnv());

  if (!parsed.success) {
    throw new Error(
      "Invalid public environment configuration.\n" +
        formatIssues(parsed.error) +
        "\n\nCopy .env.example to .env.local and fill in the values. " +
        "See docs/DEVELOPMENT.md.",
    );
  }

  cachedClientEnv = parsed.data;
  return cachedClientEnv;
}

/**
 * Non-throwing variant.
 *
 * Returns null when the environment is not configured, so callers that can
 * degrade gracefully — the proxy, public pages — keep working instead of
 * turning a missing variable into a site-wide 500. Callers that genuinely
 * cannot proceed should use `getClientEnv()` and let it throw.
 */
export function tryGetClientEnv(): ClientEnv | null {
  if (cachedClientEnv) return cachedClientEnv;

  const parsed = publicSchema.safeParse(readPublicEnv());
  if (!parsed.success) return null;

  cachedClientEnv = parsed.data;
  return cachedClientEnv;
}

/** True when Supabase credentials are present and well-formed. */
export function isSupabaseConfigured(): boolean {
  return tryGetClientEnv() !== null;
}

/** Exported for tests, which need to validate arbitrary inputs. */
export const publicEnvSchema = publicSchema;
