"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getClientEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/security/rate-limit";

import { loginSchema, registerSchema } from "./schemas";

/**
 * Shape returned to forms. `fieldErrors` maps a field name to its first
 * message; `formError` is for failures that belong to no single field.
 */
export interface AuthActionState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
}

const GENERIC_CREDENTIALS_ERROR =
  "That email or password is not correct. Please try again.";

async function clientFingerprint(): Promise<string> {
  const h = await headers();
  // x-forwarded-for is set by Vercel's proxy. Falls back to a constant in
  // local dev, which is fine: the limiter is per-process there anyway.
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local"
  );
}

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    villageId: formData.get("villageId") ?? "",
    acceptTerms: formData.get("acceptTerms") === "on",
    isRealPerson: formData.get("isRealPerson") === "on",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input = parsed.data;

  const limit = await checkRateLimit({
    key: `register:${await clientFingerprint()}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many sign-up attempts. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();

  // Username uniqueness is enforced by a unique index; this pre-check only
  // exists to return a good error instead of a constraint violation.
  const { data: taken, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", input.username)
    .maybeSingle();

  if (lookupError) {
    console.error("[auth.register] username lookup failed", lookupError);
    return {
      ok: false,
      formError: "We could not complete your sign-up. Please try again.",
    };
  }
  if (taken) {
    return { ok: false, fieldErrors: { username: "That username is taken" } };
  }

  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${getClientEnv().NEXT_PUBLIC_SITE_URL}/auth/callback`,
      // Read by the handle_new_user() trigger to seed the profile row.
      data: {
        full_name: input.fullName,
        username: input.username,
        phone: input.phone ?? null,
        village_id: input.villageId ?? null,
      },
    },
  });

  if (error) {
    console.error("[auth.register] signUp failed", error.message);
    // Supabase distinguishes "already registered"; surfacing it is standard
    // for an email-confirmation flow and does not leak more than the login
    // form already would.
    if (error.message.toLowerCase().includes("already registered")) {
      return {
        ok: false,
        fieldErrors: { email: "An account with this email already exists" },
      };
    }
    return {
      ok: false,
      formError: "We could not complete your sign-up. Please try again.",
    };
  }

  redirect("/register/check-email");
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `login:${await clientFingerprint()}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many sign-in attempts. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately identical for "no such user" and "wrong password", so the
    // form cannot be used to enumerate which emails have accounts.
    return { ok: false, formError: GENERIC_CREDENTIALS_ERROR };
  }

  redirect("/home");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
