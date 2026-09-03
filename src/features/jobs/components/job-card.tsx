import Link from "next/link";
import { Banknote, Briefcase, MapPin, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { JOB_CATEGORY_LABEL, JOB_KIND_LABEL, payLabel } from "../schemas";
import { jobClosedReason } from "../format";
import type { JobSummary } from "../queries";

export function JobCard({ job }: { job: JobSummary }) {
  const reason = jobClosedReason(job.filled_at, job.closes_at);
  const pay = payLabel(
    job.pay_min,
    job.pay_max,
    job.pay_period,
    job.pay_is_negotiable,
  );

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            href={`/jobs/${job.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {job.title}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            {reason === "filled" ? (
              <Badge variant="neutral">Filled</Badge>
            ) : reason === "closed" ? (
              <Badge variant="neutral">Closed</Badge>
            ) : null}
            <Badge variant="neutral">{JOB_KIND_LABEL[job.kind]}</Badge>
          </div>
        </div>

        {job.organization_name ? (
          <p className="mt-0.5 text-sm text-foreground">{job.organization_name}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="size-4" aria-hidden="true" />
            {JOB_CATEGORY_LABEL[job.category]}
          </span>

          {job.is_remote ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              Can be done from anywhere
            </span>
          ) : job.location_text || job.community ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {job.location_text}
              {job.location_text && job.community ? " · " : ""}
              {job.community?.name}
            </span>
          ) : null}

          {/* Rendered only when there is something to say. A blank where a wage
              should be reads as "unpaid", which is a different claim. */}
          {pay ? (
            <span className="inline-flex items-center gap-1.5">
              <Banknote className="size-4" aria-hidden="true" />
              {pay}
            </span>
          ) : null}
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {job.description}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" />
            {job.application_count.toLocaleString("en-NG")}{" "}
            {job.application_count === 1 ? "application" : "applications"}
          </span>
          {job.employer ? (
            <span>
              posted by{" "}
              <Link
                href={`/members/${job.employer.username}`}
                className="hover:underline"
              >
                {job.employer.full_name}
              </Link>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
