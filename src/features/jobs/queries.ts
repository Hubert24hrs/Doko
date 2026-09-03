import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationStatus,
  JobApplicationRow,
  JobCategory,
  JobContactRow,
  JobRow,
} from "@/types/database";

export interface JobSummary extends JobRow {
  employer: {
    username: string;
    full_name: string;
    is_verified: boolean;
  } | null;
  community: { name: string; slug: string } | null;
}

export interface JobDetail extends JobSummary {
  /**
   * Null for a signed-out reader, ALWAYS -- not because the query failed but
   * because job_contacts has no anon policy at all. That is what keeps a
   * public, indexable listing from also being a directory of phone numbers.
   */
  contact: JobContactRow | null;
  /** The caller's own application, if they have sent one. */
  viewerApplication: JobApplicationRow | null;
}

export interface JobPage {
  jobs: JobSummary[];
  nextCursor: string | null;
  available: boolean;
}

export const JOBS_PAGE_SIZE = 20;

const JOB_FIELDS = `
  id, title, description, kind, category, employer_id, organization_name,
  geo_id, location_text, is_remote, pay_min, pay_max, pay_period,
  pay_is_negotiable, closes_at, filled_at, group_id, visibility,
  application_count, created_at, updated_at, edited_at, deleted_at,
  employer:employer_id ( username, full_name, is_verified ),
  community:geo_id ( name, slug )
`;

/**
 * Open jobs, newest first.
 *
 * "Open" means not filled and not past its closing date. A filled job is not
 * hidden -- it is simply not offered as something to apply for; the page still
 * serves, so that somebody following a shared link is told what happened
 * rather than meeting a 404.
 *
 * No visibility filtering: RLS decides.
 */
export async function getOpenJobs(
  cursor?: string,
  options?: { category?: JobCategory },
): Promise<JobPage> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("jobs")
      .select(JOB_FIELDS)
      .is("deleted_at", null)
      .is("filled_at", null)
      .or(`closes_at.is.null,closes_at.gte.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(JOBS_PAGE_SIZE);

    if (cursor) query = query.lt("created_at", cursor);
    if (options?.category) query = query.eq("category", options.category);

    const { data, error } = await query;
    if (error) {
      console.error("[jobs.open] failed", error.message);
      return { jobs: [], nextCursor: null, available: false };
    }

    const jobs = (data ?? []) as unknown as JobSummary[];
    const nextCursor =
      jobs.length === JOBS_PAGE_SIZE ? jobs[jobs.length - 1].created_at : null;

    return { jobs, nextCursor, available: true };
  } catch (cause) {
    console.error("[jobs.open] unavailable", cause);
    return { jobs: [], nextCursor: null, available: false };
  }
}

/** Jobs the signed-in member posted, open or not. */
export async function getMyJobs(): Promise<JobSummary[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("jobs")
      .select(JOB_FIELDS)
      .eq("employer_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[jobs.mine] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as JobSummary[];
  } catch (cause) {
    console.error("[jobs.mine] unavailable", cause);
    return [];
  }
}

/**
 * One job, with contact details when the caller is entitled to them.
 *
 * The contact query is not guarded by an `if (user)` here. It is allowed to
 * come back empty, because the POLICY is the thing deciding -- an application
 * check in this file would be a second copy of that rule, and the copy outside
 * the database is the one that drifts.
 */
export async function getJob(jobId: string): Promise<JobDetail | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("jobs")
      .select(JOB_FIELDS)
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      console.error("[jobs.get] failed", error.message);
      return null;
    }
    if (!data) return null;

    const job = data as unknown as JobSummary;

    const { data: contact } = await supabase
      .from("job_contacts")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let viewerApplication: JobApplicationRow | null = null;
    if (user) {
      const { data: application } = await supabase
        .from("job_applications")
        .select("*")
        .eq("job_id", jobId)
        .eq("applicant_id", user.id)
        .maybeSingle();
      viewerApplication = (application as JobApplicationRow | null) ?? null;
    }

    return {
      ...job,
      contact: (contact as JobContactRow | null) ?? null,
      viewerApplication,
    };
  } catch (cause) {
    console.error("[jobs.get] unavailable", cause);
    return null;
  }
}

export interface JobApplication extends JobApplicationRow {
  applicant: {
    username: string;
    full_name: string;
    is_verified: boolean;
  } | null;
}

/**
 * Applications sent to a job.
 *
 * Returns nothing at all unless the caller is the employer -- and that is
 * enforced by RLS, not by a check here. Withdrawn ones are included so an
 * employer is not left wondering what happened to somebody they remember
 * seeing.
 */
export async function getApplications(jobId: string): Promise<JobApplication[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("job_applications")
      .select(
        "*, applicant:applicant_id ( username, full_name, is_verified )",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[jobs.applications] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as JobApplication[];
  } catch (cause) {
    console.error("[jobs.applications] unavailable", cause);
    return [];
  }
}

export interface MyApplication extends JobApplicationRow {
  job: { id: string; title: string; organization_name: string | null } | null;
}

/** What the signed-in member has applied for. */
export async function getMyApplications(): Promise<MyApplication[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("job_applications")
      .select("*, job:job_id ( id, title, organization_name )")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[jobs.myApplications] failed", error.message);
      return [];
    }
    return (data ?? []) as unknown as MyApplication[];
  } catch (cause) {
    console.error("[jobs.myApplications] unavailable", cause);
    return [];
  }
}

export type { ApplicationStatus };
