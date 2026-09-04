import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/features/auth/session";
import { getAdminIssues } from "@/features/admin/queries";
import { adminUpdateIssueStatusAction } from "@/features/admin/actions";
import {
  issueStatuses,
  ISSUE_STATUS_LABEL,
  issueCategories,
  ISSUE_CATEGORY_LABEL,
} from "@/features/issues/schemas";

export const metadata: Metadata = {
  title: "LGA Issues Operations — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  await requireStaff();
  const { category, status } = await searchParams;

  const issues = await getAdminIssues({ category, status });

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Infrastructure Issues</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            LGA Infrastructure Issues
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational overview of broken community infrastructure across all wards and villages in Igbo-Eze North.
          </p>
        </div>

        <Link
          href="/issues?view=map"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-sunken"
        >
          <MapPin className="size-3.5" aria-hidden="true" />
          View public map
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href="/admin/issues"
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              !status
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            All statuses
          </Link>
          {issueStatuses.map((s) => (
            <Link
              key={s}
              href={`/admin/issues?status=${s}`}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
              }`}
            >
              {ISSUE_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
      </div>

      {issues.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No issues matching criteria"
          description="No infrastructure issues have been reported for this filter."
        />
      ) : (
        <div className="mt-6 space-y-4">
          {issues.map((issue) => {
            const settled = issue.status === "resolved";

            return (
              <Card key={issue.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/issues/${issue.id}`}
                        className="text-base font-semibold text-foreground hover:underline"
                      >
                        {issue.title}
                      </Link>
                      <Badge variant={settled ? "primary" : "neutral"}>
                        {ISSUE_STATUS_LABEL[issue.status]}
                      </Badge>
                      <Badge variant="neutral">
                        {ISSUE_CATEGORY_LABEL[issue.category]}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>Community: <strong>{issue.community?.name ?? "Igbo-Eze North"}</strong></span>
                      {issue.location_text ? <span>· {issue.location_text}</span> : null}
                      {issue.reporter ? <span>· Reported by @{issue.reporter.username}</span> : null}
                      <span>· {issue.confirm_count} confirmations</span>
                    </p>

                    <p className="mt-2 text-sm text-foreground line-clamp-2">
                      {issue.description}
                    </p>
                  </div>

                  {/* Status update form */}
                  <form
                    action={async (formData) => {
                      "use server";
                      await adminUpdateIssueStatusAction({ ok: false }, formData);
                    }}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken/40 p-2 text-xs"
                  >
                    <input type="hidden" name="issueId" value={issue.id} />
                    <select
                      name="status"
                      defaultValue={issue.status}
                      aria-label="Update status"
                      className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs font-medium text-foreground"
                    >
                      {issueStatuses.map((s) => (
                        <option key={s} value={s}>
                          {ISSUE_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      name="note"
                      defaultValue={issue.status_note ?? ""}
                      placeholder="Add public leadership note..."
                      className="h-8 w-48 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground placeholder:text-muted-foreground"
                    />

                    <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                      Update
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
