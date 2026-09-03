"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  confirmIssueSchema,
  createIssueSchema,
  issueStatusSchema,
  removeIssueSchema,
} from "./schemas";

export interface IssueState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  changedAt?: string;
  /** Set on success so the composer can upload photos before navigating. */
  issueId?: string;
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

/**
 * Report an issue.
 *
 * Returns the id rather than redirecting, for the same reason
 * createListingAction does: photographs upload against the issue's id and the
 * client cannot navigate until they have.
 */
export async function createIssueAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  const user = await requireUser("/issues");

  const parsed = createIssueSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category") ?? "other",
    geoId: formData.get("geoId") ?? "",
    locationText: formData.get("locationText") ?? "",
    latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `issue-create:${user.id}`,
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: "You have reported several issues today. Please try again tomorrow.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_issues")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      geo_id: parsed.data.geoId,
      location_text: parsed.data.locationText,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      reporter_id: user.id,
    })
    .select("id");

  if (error) {
    console.error("[issues.create] failed", error.message);
    return { ok: false, formError: "That report could not be saved." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That report could not be saved." };
  }

  revalidatePath("/issues");
  return { ok: true, issueId: data[0].id };
}

/**
 * "I see this too", and taking it back.
 *
 * The desired END STATE rather than a toggle, as everywhere else: a toggle
 * read from stale UI does the opposite of what somebody meant. Withdrawing
 * hard-deletes, because a confirmation is a current statement of fact and a
 * tombstone would misstate how many people still see the problem.
 */
export async function confirmIssueAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  const user = await requireUser("/issues");

  const parsed = confirmIssueSchema.safeParse({
    issueId: formData.get("issueId"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That could not be recorded." };
  }

  const limit = await checkRateLimit({
    key: `issue-confirm:${user.id}`,
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

  if (parsed.data.intent === "withdraw") {
    const { error } = await supabase
      .from("issue_confirmations")
      .delete()
      .eq("issue_id", parsed.data.issueId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[issues.confirm.withdraw] failed", error.message);
      return { ok: false, formError: "That could not be withdrawn." };
    }
  } else {
    const { error } = await supabase.from("issue_confirmations").insert({
      issue_id: parsed.data.issueId,
      user_id: user.id,
    });

    // 23505 means it was already recorded, which is the desired end state.
    if (error && error.code !== "23505") {
      console.error("[issues.confirm] failed", error.message);
      return { ok: false, formError: "That could not be recorded." };
    }
  }

  revalidatePath(`/issues/${parsed.data.issueId}`);
  revalidatePath("/issues");
  return { ok: true, changedAt: new Date().toISOString() };
}

/**
 * Move an issue's status.
 *
 * Only staff and the community admin whose scope contains it may reach this;
 * the guard trigger restores the status for anybody else, and stamps who
 * moved it rather than trusting the client to say.
 */
export async function setIssueStatusAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  await requireUser("/issues");

  const parsed = issueStatusSchema.safeParse({
    issueId: formData.get("issueId"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_issues")
    .update({ status: parsed.data.status, status_note: parsed.data.note })
    .eq("id", parsed.data.issueId)
    .select("id");

  if (error) {
    console.error("[issues.status] failed", error.message);
    return { ok: false, formError: "That status could not be changed." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That status could not be changed." };
  }

  revalidatePath(`/issues/${parsed.data.issueId}`);
  revalidatePath("/issues");
  return { ok: true, changedAt: new Date().toISOString() };
}

/** Withdraw a report. Soft, so a withdrawal reads as one. */
export async function removeIssueAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  await requireUser("/issues");

  const parsed = removeIssueSchema.safeParse({
    issueId: formData.get("issueId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That report could not be withdrawn." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_issues")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.issueId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[issues.remove] failed", error.message);
    return { ok: false, formError: "That report could not be withdrawn." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That report could not be withdrawn." };
  }

  revalidatePath("/issues");
  redirect("/issues");
}
