import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AppRole, ProfileRow } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string | null;
  profile: ProfileRow | null;
  roles: AppRole[];
}

const STAFF_ROLES: AppRole[] = ["super_admin", "admin", "moderator"];
const ADMIN_ROLES: AppRole[] = ["super_admin", "admin"];

/**
 * The authenticated user for the current request, or null.
 *
 * Always resolves identity with `getUser()`, which verifies the JWT against
 * the auth server. `getSession()` would trust an unverified cookie.
 *
 * `cache()` keeps this to one round trip per render even when several Server
 * Components ask for it.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);

    return {
      id: user.id,
      email: user.email ?? null,
      profile: profile ?? null,
      roles: (roleRows ?? []).map((r) => r.role),
    };
  } catch (cause) {
    // Unconfigured environment or an unreachable database. Resolving to "no
    // session" sends the caller to sign-in, which is the correct and safe
    // outcome — it can never grant access.
    console.error("[auth.getSessionUser] failed, treating as signed out", cause);
    return null;
  }
});

/** Redirects to sign-in when there is no session. */
export async function requireUser(
  returnTo = "/home",
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  return user;
}

export function hasAnyRole(user: SessionUser, roles: AppRole[]): boolean {
  return user.roles.some((role) => roles.includes(role));
}

export function isStaff(user: SessionUser): boolean {
  return hasAnyRole(user, STAFF_ROLES);
}

export function isAdmin(user: SessionUser): boolean {
  return hasAnyRole(user, ADMIN_ROLES);
}

/**
 * Gate for /admin. This is a usability guard that returns a good redirect —
 * it is NOT the security boundary. Every admin table is protected by RLS, so
 * a user who bypasses this still cannot read or write anything.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!isStaff(user)) {
    redirect("/home?error=forbidden");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!isAdmin(user)) {
    redirect("/home?error=forbidden");
  }
  return user;
}

export async function isVerifier(user: SessionUser): Promise<boolean> {
  if (isAdmin(user) || isStaff(user)) return true;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("verification_delegates")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function requireVerifier(): Promise<SessionUser> {
  const user = await requireUser("/admin/members");
  const allowed = await isVerifier(user);
  if (!allowed) {
    redirect("/home?error=forbidden");
  }
  return user;
}

