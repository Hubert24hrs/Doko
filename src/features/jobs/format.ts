/**
 * Deriving a job's state from its dates.
 *
 * These live in a module rather than inline in the components for a practical
 * reason as well as a tidiness one: "is this closed" is asked on the card, on
 * the page and in the apply form, and three copies of the same comparison is
 * three places for it to drift. The database asks the same question once more
 * in job_applications_insert_own, which is the copy that actually decides.
 */

/** A job stops taking applications when it is filled OR past its closing date. */
export function isJobClosed(
  filledAt: string | null,
  closesAt: string | null,
): boolean {
  if (filledAt !== null) return true;
  if (closesAt === null) return false;
  return new Date(closesAt).getTime() < Date.now();
}

/** Why it is closed, for a reader who needs telling which. */
export function jobClosedReason(
  filledAt: string | null,
  closesAt: string | null,
): "filled" | "closed" | null {
  if (filledAt !== null) return "filled";
  if (closesAt !== null && new Date(closesAt).getTime() < Date.now()) {
    return "closed";
  }
  return null;
}
