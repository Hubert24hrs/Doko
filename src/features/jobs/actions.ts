"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  applicationDecisionSchema,
  applySchema,
  createJobSchema,
  jobStateSchema,
  withdrawApplicationSchema,
} from "./schemas";

export interface JobState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  changedAt?: string;
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
 * Post a job.
 *
 * Two writes, and the order matters: the job first, then the contact row that
 * references it. If the second fails the employer keeps the listing and can
 * add the details again -- the other order would lose the whole advert because
 * a phone number did not save. Same reasoning as saving a post before its
 * images.
 */
export async function createJobAction(
  _prev: JobState,
  formData: FormData,
): Promise<JobState> {
  const user = await requireUser("/jobs");

  const parsed = createJobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    organizationName: formData.get("organizationName") ?? "",
    locationText: formData.get("locationText") ?? "",
    kind: formData.get("kind") ?? "full_time",
    category: formData.get("category") ?? "other",
    geoId: formData.get("geoId") ?? "",
    visibility: formData.get("visibility") ?? "public",
    isRemote: formData.get("isRemote") ?? "",
    payIsNegotiable: formData.get("payIsNegotiable") ?? "",
    payMin: formData.get("payMin") ?? "",
    payMax: formData.get("payMax") ?? "",
    payPeriod: formData.get("payPeriod") ?? "",
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    externalUrl: formData.get("externalUrl") ?? "",
    instructions: formData.get("instructions") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `job-create:${user.id}`,
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: "You have posted several jobs today. Please try again tomorrow.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      organization_name: parsed.data.organizationName,
      location_text: parsed.data.locationText,
      kind: parsed.data.kind,
      category: parsed.data.category,
      geo_id: parsed.data.geoId,
      visibility: parsed.data.visibility,
      is_remote: parsed.data.isRemote,
      pay_min: parsed.data.payMin,
      pay_max: parsed.data.payMax,
      pay_period: parsed.data.payPeriod === "" ? null : parsed.data.payPeriod,
      pay_is_negotiable: parsed.data.payIsNegotiable,
      employer_id: user.id,
    })
    .select("id");

  if (error) {
    console.error("[jobs.create] failed", error.message);
    return { ok: false, formError: "That job could not be posted." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That job could not be posted." };
  }

  const jobId = data[0].id;

  const { error: contactError } = await supabase.from("job_contacts").insert({
    job_id: jobId,
    contact_name: parsed.data.contactName,
    contact_phone: parsed.data.contactPhone,
    contact_email: parsed.data.contactEmail,
    external_url: parsed.data.externalUrl,
    instructions: parsed.data.instructions,
  });

  if (contactError) {
    // Logged and not fatal. The advert exists and the employer can add the
    // details again; failing the whole thing here would throw away everything
    // they wrote because one field did not save.
    console.error("[jobs.create] contact failed", contactError.message);
  }

  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

export async function applyToJobAction(
  _prev: JobState,
  formData: FormData,
): Promise<JobState> {
  const user = await requireUser("/jobs");

  const parsed = applySchema.safeParse({
    jobId: formData.get("jobId"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `job-apply:${user.id}`,
    limit: 50,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: "You have applied for a great many jobs today. Try again tomorrow.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_applications")
    .insert({
      job_id: parsed.data.jobId,
      applicant_id: user.id,
      message: parsed.data.message,
    })
    .select("id");

  if (error) {
    console.error("[jobs.apply] failed", error.message);
    if (error.code === "23505") {
      return {
        ok: false,
        formError: "You have already applied for this job.",
      };
    }
    if (error.code === "42501") {
      // The policy refuses a filled job, a closed one, and your own. One
      // message covers all three rather than reporting which.
      return {
        ok: false,
        formError: "This job is no longer taking applications.",
      };
    }
    return { ok: false, formError: "Your application could not be sent." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "Your application could not be sent." };
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}

/**
 * The employer's decision on one application.
 *
 * The guard trigger restores `message` for anybody who is not the applicant,
 * so this cannot become a way to edit what somebody wrote about themselves.
 */
export async function decideApplicationAction(
  _prev: JobState,
  formData: FormData,
): Promise<JobState> {
  await requireUser("/jobs");

  const parsed = applicationDecisionSchema.safeParse({
    applicationId: formData.get("applicationId"),
    jobId: formData.get("jobId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That decision could not be recorded." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_applications")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.applicationId)
    .select("id");

  if (error) {
    console.error("[jobs.decide] failed", error.message);
    return { ok: false, formError: "That decision could not be recorded." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That decision could not be recorded." };
  }

  revalidatePath(`/jobs/${parsed.data.jobId}/applications`);
  return { ok: true, changedAt: new Date().toISOString() };
}

export async function withdrawApplicationAction(
  _prev: JobState,
  formData: FormData,
): Promise<JobState> {
  await requireUser("/jobs");

  const parsed = withdrawApplicationSchema.safeParse({
    applicationId: formData.get("applicationId"),
    jobId: formData.get("jobId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That application could not be withdrawn." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_applications")
    .update({ status: "withdrawn" })
    .eq("id", parsed.data.applicationId)
    .select("id");

  if (error) {
    console.error("[jobs.withdraw] failed", error.message);
    return { ok: false, formError: "That application could not be withdrawn." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That application could not be withdrawn." };
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}

/**
 * Mark a job filled, reopen it, or take it down.
 *
 * A filled job is NOT removed. Somebody who applied deserves to see what
 * happened, and a vacancy that simply disappeared tells them nothing.
 */
export async function setJobStateAction(
  _prev: JobState,
  formData: FormData,
): Promise<JobState> {
  await requireUser("/jobs");

  const parsed = jobStateSchema.safeParse({
    jobId: formData.get("jobId"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That change could not be made." };
  }

  const now = new Date().toISOString();
  const patch =
    parsed.data.intent === "fill"
      ? { filled_at: now }
      : parsed.data.intent === "reopen"
        ? { filled_at: null }
        : { deleted_at: now };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", parsed.data.jobId)
    .select("id");

  if (error) {
    console.error("[jobs.setState] failed", error.message);
    return { ok: false, formError: "That change could not be made." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That change could not be made." };
  }

  revalidatePath("/jobs");
  if (parsed.data.intent === "remove") redirect("/jobs");

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true, changedAt: new Date().toISOString() };
}
