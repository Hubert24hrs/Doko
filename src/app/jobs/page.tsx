import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getMyJobs, getOpenJobs } from "@/features/jobs/queries";
import { JobCard } from "@/features/jobs/components/job-card";
import { JOB_CATEGORY_LABEL, jobCategories } from "@/features/jobs/schemas";

export const metadata: Metadata = {
  title: "Jobs",
  description:
    "Work and vacancies across Igbo Eze North: teaching, trades, farming, transport and more.",
  alternates: { canonical: "/jobs" },
};

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; category?: string }>;
}) {
  const { before, category } = await searchParams;
  const viewer = await getSessionUser();

  const validCategory = jobCategories.find((c) => c === category);

  const [page, mine] = await Promise.all([
    getOpenJobs(before, { category: validCategory }),
    viewer ? getMyJobs() : Promise.resolve([]),
  ]);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {viewer ? (
              <>
                <Link
                  href="/events"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
                >
                  Events
                </Link>
                <Link
                  href="/jobs/new"
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Post a job
                </Link>
              </>
            ) : (
              <Link
                href="/login?next=%2Fjobs"
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Jobs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Work across Igbo-Eze North. Contact details are shown to signed-in
          members only.
        </p>

        <div className="mt-6 flex flex-wrap gap-1.5">
          <Link
            href="/jobs"
            className={
              validCategory
                ? "rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-sunken"
                : "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            }
          >
            All
          </Link>
          {jobCategories.map((c) => (
            <Link
              key={c}
              href={`/jobs?category=${c}`}
              className={
                validCategory === c
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-sunken"
              }
            >
              {JOB_CATEGORY_LABEL[c]}
            </Link>
          ))}
        </div>

        {mine.length > 0 ? (
          <section aria-labelledby="mine-heading" className="mt-8">
            <h2
              id="mine-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Jobs you posted
            </h2>
            <div className="space-y-3">
              {mine.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-label="Jobs" className="mt-8 space-y-3">
          {mine.length > 0 ? (
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Open jobs
            </h2>
          ) : null}

          {!page.available ? (
            <ErrorState
              title="Jobs could not be loaded"
              description="This is usually a temporary connection problem. Please try again shortly."
            />
          ) : page.jobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="size-6" />}
              title="No open jobs"
              description="When somebody is hiring in Igbo-Eze North, it will appear here."
            />
          ) : (
            page.jobs.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </section>

        {page.nextCursor ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`/jobs?${validCategory ? `category=${validCategory}&` : ""}before=${encodeURIComponent(page.nextCursor)}`}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
            >
              Show more
            </Link>
          </div>
        ) : null}
      </main>
    </>
  );
}
