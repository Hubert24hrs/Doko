import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Explains why a redirect happened.
 *
 * Several places bounce a member somewhere with `?error=…`, and until this
 * existed every one of those was silent: a failed provider sign-in returned
 * you to the login page looking exactly like a button that did nothing.
 *
 * The messages deliberately avoid blaming the member and avoid naming
 * internals. "invalid_code" means an expired or replayed one-time code, which
 * is usually a stale tab or a back button, not anything they did wrong.
 */
const MESSAGES: Record<string, string> = {
  invalid_code:
    "That sign-in link had already been used or had expired. Please try signing in again.",
  missing_code:
    "That sign-in attempt did not complete. Please try again.",
  forbidden:
    "You do not have access to that area. If you believe you should, ask an administrator.",
};

export function AuthNotice({
  error,
  className,
}: {
  error?: string | string[];
  className?: string;
}) {
  // A repeated query parameter arrives as an array; take the first.
  const key = Array.isArray(error) ? error[0] : error;
  if (!key) return null;

  // An unrecognised code still deserves an explanation rather than silence,
  // but never echoes the raw value back into the page.
  const message =
    MESSAGES[key] ?? "Something went wrong with that request. Please try again.";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-warning/40",
        "bg-eo-gold-100 px-4 py-3 text-sm text-[color:var(--eo-gold-700)]",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
