/**
 * The Community Pulse window, as plain functions.
 *
 * These live outside `queries.ts` because that file is a `"use server"`
 * module, and every export of one must be an async function — Next refuses
 * the build otherwise, with "Server Actions must be async functions". A pure
 * predicate and a constant have no business being server actions anyway: they
 * are shared with the client and cost nothing to run there.
 */

/** The pulse is a 24-hour window. Nothing older than this may appear in it. */
export const PULSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when `timestamp` falls inside the 24-hour pulse window. */
export function isWithinPulseWindow(
  timestamp: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!timestamp) return false;
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) return false;
  // A clock-skewed future timestamp still counts: hiding somebody because a
  // server clock drifted forwards would be worse than showing them.
  return now - at < PULSE_WINDOW_MS;
}
