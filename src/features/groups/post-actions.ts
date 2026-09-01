"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { POST_MAX_LENGTH } from "@/features/posts/schemas";

export interface GroupPostState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  postId?: string;
}

const createGroupPostSchema = z.object({
  groupId: z.uuid(),
  slug: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(1, "Write something before posting")
    .max(POST_MAX_LENGTH, `A post can be at most ${POST_MAX_LENGTH} characters`),
});

/**
 * Post into a group.
 *
 * `visibility` is left at its column default and never consulted for a group
 * post: posts_select_group ignores it entirely, because membership of the
 * group IS the access rule. Setting it here would imply a control that does
 * not exist.
 */
export async function createGroupPostAction(
  _prev: GroupPostState,
  formData: FormData,
): Promise<GroupPostState> {
  const user = await requireUser("/groups");

  const parsed = createGroupPostSchema.safeParse({
    groupId: formData.get("groupId"),
    slug: formData.get("slug"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors: errors };
  }

  const limit = await checkRateLimit({
    key: `post:${user.id}`,
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
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      body: parsed.data.body,
      group_id: parsed.data.groupId,
    })
    .select("id");

  if (error) {
    console.error("[groups.createPost] failed", error.message);
    // posts_insert_group requires membership, so 42501 means "not a member"
    // rather than anything the member could fix by retrying.
    if (error.code === "42501") {
      return {
        ok: false,
        formError: "You need to join this group before posting in it.",
      };
    }
    return { ok: false, formError: "Your post could not be saved." };
  }

  if (!data || data.length === 0) {
    return { ok: false, formError: "Your post could not be saved." };
  }

  revalidatePath(`/groups/${parsed.data.slug}`);
  return { ok: true, postId: data[0].id };
}
