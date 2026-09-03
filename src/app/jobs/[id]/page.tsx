import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Lock,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getJob } from "@/features/jobs/queries";
import {
  JOB_CATEGORY_LABEL,
  JOB_KIND_LABEL,
  payLabel,
} from "@/features/jobs/schemas";
import { isJobClosed } from "@/features/jobs/format";
import { ApplyForm } from "@/features/jobs/components/apply-form";
import { EmployerControls } from "@/features/jobs/components/employer-controls";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);

  if (!job) {
    return { title: "Job", robots: { index: false, follow: false } };
  }

  const indexable = job.group_id === null && job.visibility === "public";

  return {
    title: job.filled_at ? `Filled: ${job.title}` : job.title,
    description: job.description.slice(0, 160),
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: indexable ? { canonical: `/jobs/${job.id}` } : undefined,
  };
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [job, viewer] = await Promise.all([getJob(id), getSessionUser()]);
  if (!job) notFound();

  const isEmployer = viewer?.id === job.employer_id;
  const filled = job.filled_at !== null;
  const closed = isJobClosed(job.filled_at, job.closes_at);
  const pay = payLabel(
    job.pay_min,
    job.pay_max,
    job.pay_period,
    job.pay_is_negotiable,
  );

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All jobs
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {filled ? (
          <div className="mb-4 rounded-lg border border-border-strong bg-surface-sunken px-4 py-3 text-sm text-foreground">
            <strong className="font-semibold">This job has been filled.</strong>{" "}
            It is kept here so that everybody who applied can see what happened.
          </div>
        ) : null}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {job.title}
              </h1>
              <Badge variant="neutral">{JOB_KIND_LABEL[job.kind]}</Badge>
            </div>

            {job.organization_name ? (
              <p className="mt-1 text-foreground">{job.organization_name}</p>
            ) : null}

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <dt className="mt-0.5 text-muted-foreground">
                  <Briefcase className="size-4" aria-hidden="true" />
                  <span className="sr-only">Kind of work</span>
                </dt>
                <dd className="text-foreground">
                  {JOB_CATEGORY_LABEL[job.category]}
                </dd>
              </div>

              {job.is_remote || job.location_text || job.community ? (
                <div className="flex items-start gap-2">
                  <dt className="mt-0.5 text-muted-foreground">
                    <MapPin className="size-4" aria-hidden="true" />
                    <span className="sr-only">Where</span>
                  </dt>
                  <dd className="text-foreground">
                    {job.is_remote
                      ? "Can be done from anywhere"
                      : [job.location_text, job.community?.name]
                          .filter(Boolean)
                          .join(" · ")}
                  </dd>
                </div>
              ) : null}

              {pay ? (
                <div className="flex items-start gap-2">
                  <dt className="mt-0.5 text-muted-foreground">
                    <Banknote className="size-4" aria-hidden="true" />
                    <span className="sr-only">Pay</span>
                  </dt>
                  <dd className="text-foreground">{pay}</dd>
                </div>
              ) : null}
            </dl>

            <p className="mt-4 whitespace-pre-wrap break-words text-foreground">
              {job.description}
            </p>

            {job.employer ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Posted by{" "}
                <Link
                  href={`/members/${job.employer.username}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {job.employer.full_name}
                </Link>
                {job.employer.is_verified ? (
                  <>
                    {" "}
                    <VerifiedBadge />
                  </>
                ) : null}
                {job.edited_at ? " · edited" : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section aria-labelledby="contact-heading" className="mt-6">
          <h2
            id="contact-heading"
            className="mb-3 text-sm font-semibold text-foreground"
          >
            How to reach them
          </h2>

          {/* job.contact is null for a signed-out reader ALWAYS: job_contacts
              has no anon policy at all. That is what lets this page be public
              and indexable without the phone numbers on it being public too. */}
          {job.contact ? (
            <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
              {job.contact.contact_name ? (
                <p className="text-foreground">
                  Ask for {job.contact.contact_name}
                </p>
              ) : null}
              {job.contact.contact_phone ? (
                <p className="flex items-center gap-2 text-foreground">
                  <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                  <a
                    href={`tel:${job.contact.contact_phone.replace(/\s/g, "")}`}
                    className="hover:underline"
                  >
                    {job.contact.contact_phone}
                  </a>
                </p>
              ) : null}
              {job.contact.contact_email ? (
                <p className="flex items-center gap-2 text-foreground">
                  <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                  <a
                    href={`mailto:${job.contact.contact_email}`}
                    className="hover:underline"
                  >
                    {job.contact.contact_email}
                  </a>
                </p>
              ) : null}
              {job.contact.external_url ? (
                <p className="text-foreground">
                  <a
                    href={job.contact.external_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary hover:underline"
                  >
                    Apply on their web page
                  </a>
                </p>
              ) : null}
              {job.contact.instructions ? (
                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                  {job.contact.instructions}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-sunken p-4">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Contact details are shown to signed-in members only, so that
                this page cannot be used to collect employers&rsquo; phone
                numbers.
              </p>
              {!viewer ? (
                <Link
                  href={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`}
                  className="mt-3 inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
                >
                  Sign in to see them
                </Link>
              ) : null}
            </div>
          )}
        </section>

        {!isEmployer ? (
          <section aria-labelledby="apply-heading" className="mt-8">
            <h2
              id="apply-heading"
              className="mb-3 text-sm font-semibold text-foreground"
            >
              Apply through Ezike Oba
            </h2>
            {viewer ? (
              <ApplyForm
                jobId={job.id}
                existing={job.viewerApplication}
                closed={closed}
              />
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`}
                className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
              >
                Sign in to apply
              </Link>
            )}
          </section>
        ) : (
          <section className="mt-8">
            <EmployerControls
              jobId={job.id}
              filled={filled}
              applicationCount={job.application_count}
            />
          </section>
        )}
      </main>
    </>
  );
}
