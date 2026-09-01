"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import { createPostSchema, deletePostSchema, updatePostSchema } from "./schemas";

export interface PostActionState {
  ok: boolean;
  message?: string;
  formError?: string;
  fieldErrors?: Record<string, string>;
  /**
   * Timestamp of a successful submission. The composer uses it as a React
   * key, so a success remounts the form and clears it -- no effect, and no
   * setState during render.
   */
  postedAt?: string;
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

async function clientFingerprint(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local"
  );
}

export async function createPostAction(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const user = await requireUser("/feed");

  const parsed = createPostSchema.safeParse({
    body: formData.get("body"),
    geoId: formData.get("geoId") ?? "",
    visibility: formData.get("visibility") ?? "public",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  // Keyed on the member rather than the IP: posting is an authenticated act,
  // and a shared connection in an internet cafe should not mean one member's
  // enthusiasm silences everyone else on it.
  const limit = await checkRateLimit({
    key: `post:${user.id}:${await clientFingerprint()}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `You have posted a lot in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("posts").insert({
    author_id: user.id,
    body: parsed.data.body,
    geo_id: parsed.data.geoId,
    visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[posts.create] insert failed", error.message);
    // The INSERT policy also requires is_active_member(), so a suspended
    // account lands here rather than being told "nothing happened".
    if (error.code === "42501") {
      return {
        ok: false,
        formError:
          "Your account cannot post at the moment. Please contact an administrator.",
      };
    }
    return { ok: false, formError: "Your post could not be saved. Please try again." };
  }

  revalidatePath("/feed");
  revalidatePath("/home");
  return { ok: true, message: "Posted.", postedAt: new Date().toISOString() };
}

export async function updatePostAction(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const user = await requireUser("/feed");

  const parsed = updatePostSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `post-edit:${user.id}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many edits in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  // `.select()` is what turns a silent no-op into an honest failure. RLS does
  // not raise when it refuses a write: the row is simply not visible to the
  // UPDATE, zero rows change, and `error` is null. Without checking what came
  // back, editing somebody else's post would report "Post updated."
  const { data, error } = await supabase
    .from("posts")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.postId)
    .select("id");

  if (error) {
    console.error("[posts.update] failed", error.message);
    return { ok: false, formError: "Your edit could not be saved." };
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      formError: "That post could not be edited. It may have been removed, or it may not be yours.",
    };
  }

  revalidatePath("/feed");
  revalidatePath(`/posts/${parsed.data.postId}`);
  return {
    ok: true,
    message: "Post updated.",
    postedAt: new Date().toISOString(),
  };
}

export async function deletePostAction(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const user = await requireUser("/feed");

  const parsed = deletePostSchema.safeParse({ postId: formData.get("postId") });
  if (!parsed.success) {
    return { ok: false, formError: "That post could not be found." };
  }

  const limit = await checkRateLimit({
    key: `post-remove:${user.id}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many removals in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  // Soft delete. There is no DELETE policy on posts for anyone, so removal is
  // always a timestamp: moderation stays auditable and a member's history is
  // never silently rewritten.
  const { data, error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.postId)
    .select("id");

  if (error) {
    console.error("[posts.delete] failed", error.message);
    return { ok: false, formError: "The post could not be removed." };
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      formError: "That post could not be removed. It may already be gone.",
    };
  }

  revalidatePath("/feed");
  revalidatePath("/home");
  return { ok: true, message: "Post removed." };
}
