"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

export interface FollowActionState {
  ok: boolean;
  formError?: string;
  /** Fresh on each success, so the button can settle by remounting. */
  changedAt?: string;
}

const followSchema = z.object({
  profileId: z.uuid(),
  username: z.string().min(1),
  /** What the client believes the current state is; the server decides. */
  intent: z.enum(["follow", "unfollow"]),
});

/**
 * Follow or unfollow a member.
 *
 * The intent is explicit rather than a toggle, because a toggle read from
 * stale UI does the opposite of what the member meant — double-clicking a
 * "Follow" button would follow then immediately unfollow. Sending the desired
 * end state makes the operation idempotent instead: following someone you
 * already follow is a no-op, not a reversal.
 */
export async function setFollowAction(
  _prev: FollowActionState,
  formData: FormData,
): Promise<FollowActionState> {
  const user = await requireUser("/feed");

  const parsed = followSchema.safeParse({
    profileId: formData.get("profileId"),
    username: formData.get("username"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That request could not be understood." };
  }

  const { profileId, username, intent } = parsed.data;

  if (profileId === user.id) {
    // Also enforced by a CHECK constraint; this is the readable message.
    return { ok: false, formError: "You cannot follow yourself." };
  }

  const limit = await checkRateLimit({
    key: `follow:${user.id}`,
    limit: 200,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: `Too many changes in a short time. Try again in ${limit.retryAfterMinutes} minutes.`,
    };
  }

  const supabase = await createClient();

  if (intent === "follow") {
    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: user.id, following_id: profileId });

    // 23505 is the primary key rejecting a follow that already exists, which
    // is the desired end state -- not a failure.
    if (error && error.code !== "23505") {
      console.error("[follows.set] insert failed", error.message);
      if (error.code === "42501") {
        return { ok: false, formError: "You cannot follow this member." };
      }
      return { ok: false, formError: "That could not be saved. Please try again." };
    }
  } else {
    // No row-count check here: unfollowing someone you do not follow is
    // already the desired end state, so zero rows is success.
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", profileId);

    if (error) {
      console.error("[follows.set] delete failed", error.message);
      return { ok: false, formError: "That could not be saved. Please try again." };
    }
  }

  revalidatePath(`/members/${username}`);
  revalidatePath("/feed");
  return { ok: true, changedAt: new Date().toISOString() };
}
