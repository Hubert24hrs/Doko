import Link from "next/link";
import { Eye, MapPin } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { ISSUE_CATEGORY_LABEL, ISSUE_STATUS_LABEL } from "../schemas";
import type { IssueSummary } from "../queries";

/**
 * A resolved issue is styled as settled rather than struck through.
 *
 * Striking it out would read as "withdrawn"; this one was fixed, which is the
 * outcome the whole feature exists to produce and the last thing to hide.
 */
export function IssueCard({ issue }: { issue: IssueSummary }) {
  const settled = issue.status === "resolved";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            href={`/issues/${issue.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {issue.title}
          </Link>
          <Badge variant={settled ? "primary" : "neutral"}>
            {ISSUE_STATUS_LABEL[issue.status]}
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{ISSUE_CATEGORY_LABEL[issue.category]}</span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {[issue.location_text, issue.community?.name]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {issue.description}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden="true" />
            {issue.confirm_count.toLocaleString("en-NG")} confirmed
          </span>
          {issue.reporter ? (
            <span>
              reported by{" "}
              <Link
                href={`/members/${issue.reporter.username}`}
                className="hover:underline"
              >
                {issue.reporter.full_name}
              </Link>
            </span>
          ) : null}
        </div>

        {issue.status_note ? (
          <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-foreground">
            {issue.status_note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
