/**
 * Open-redirect protection.
 *
 * `next` / `returnTo` parameters are attacker-controllable. Anything that is
 * not a plain same-origin path is rejected, so a crafted link cannot bounce a
 * member off-site after sign-in.
 */

/**
 * True if the string contains any C0 control character or DEL.
 *
 * Written as a code-point scan rather than a regex literal so the source
 * contains no escape sequences and no raw control bytes.
 */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeRelativePath(
  value: string | null | undefined,
  fallback = "/home",
): string {
  if (!value) return fallback;

  // Must be a rooted path.
  if (!value.startsWith("/")) return fallback;

  // "//evil.com" is a protocol-relative URL, not a path.
  if (value.startsWith("//")) return fallback;

  // Some browsers normalise backslashes to forward slashes, so a leading
  // "/\" can escape the origin. Reject backslashes outright.
  if (value.includes("\\")) return fallback;

  // Tab, newline and NUL can smuggle a scheme past naive checks.
  if (hasControlCharacters(value)) return fallback;

  return value;
}
