import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface RateLimitOptions {
  /** Stable identifier for the bucket, e.g. `login:203.0.113.4`. */
  key: string;
  /** Maximum requests permitted per window. */
  limit: number;
  /** Fixed window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  retryAfterMinutes: number;
}

/**
 * Consume one unit from a durable, Postgres-backed fixed window.
 *
 * FAILURE MODE — deliberate: if the database call fails we allow the request
 * and log loudly. A limiter outage would otherwise lock every member out of
 * sign-in, turning a degraded dependency into a full outage. The tradeoff is
 * recorded in docs/SECURITY.md; abuse is still bounded by Supabase Auth's own
 * limits.
 */
export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    if (error) {
      console.error("[rate-limit] rpc failed, allowing request", error.message);
      return { allowed: true, currentCount: 0, retryAfterMinutes: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { allowed: true, currentCount: 0, retryAfterMinutes: 0 };
    }

    const windowStartMs = new Date(row.window_start).getTime();
    const msRemaining = Math.max(0, windowStartMs + windowMs - Date.now());

    return {
      allowed: row.allowed,
      currentCount: row.current_count,
      retryAfterMinutes: Math.max(1, Math.ceil(msRemaining / 60_000)),
    };
  } catch (cause) {
    console.error("[rate-limit] unexpected failure, allowing request", cause);
    return { allowed: true, currentCount: 0, retryAfterMinutes: 0 };
  }
}
