import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getApplications, getJob } from "@/features/jobs/queries";
import { APPLICATION_STATUS_LABEL } from "@/features/jobs/schemas";
import { ApplicationDecision } from "@/features/jobs/components/application-decision";

export const metadata: Metadata = {
  title: "Applications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/jobs/${id}/applications`);

  const job = await getJob(id);
  if (!job) notFound();

  // Not the employer means not this page. 404 rather than 403, as everywhere
  // else: a 403 would confirm which jobs have applications worth looking at.
  if (job.employer_id !== user.id) notFound();

  const applications = await getApplications(id);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href={`/jobs/${id}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the job
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Applications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For {job.title}. Only you can read these.
        </p>

        <section aria-label="Applications" className="mt-6 space-y-3">
          {applications.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title="Nobody has applied yet"
              description="Applications sent through Ezike Oba will appear here."
            />
          ) : (
            applications.map((application) => (
              <Card key={application.id}>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/members/${application.applicant?.username ?? ""}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {application.applicant?.full_name ?? "A member"}
                      </Link>
                      {application.applicant?.is_verified ? (
                        <VerifiedBadge />
                      ) : null}
                    </div>
                    <Badge variant="neutral">
                      {APPLICATION_STATUS_LABEL[application.status]}
                    </Badge>
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={application.created_at}>
                      {new Date(application.created_at).toLocaleDateString(
                        "en-NG",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </time>
                  </p>

                  {application.message ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">
                      {application.message}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <ApplicationDecision
                      applicationId={application.id}
                      jobId={id}
                      status={application.status}
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </main>
    </>
  );
}
