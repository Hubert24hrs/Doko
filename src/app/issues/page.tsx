import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Layers, List, MapPin, Plus } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import {
  getIssues,
  getMappedIssues,
  getIssueCounts,
  type IssueSummary,
} from "@/features/issues/queries";
import { IssueCard } from "@/features/issues/components/issue-card";
import {
  issueCategories,
  ISSUE_CATEGORY_LABEL,
  issueStatuses,
  ISSUE_STATUS_LABEL,
} from "@/features/issues/schemas";
import { IssuesMap, type MappedIssueItem } from "@/components/map";
import type { IssueCategory, IssueStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Community Issues",
  description:
    "Report and track broken infrastructure across Igbo Eze North: boreholes, roads, transformers, clinics and schools.",
  alternates: { canonical: "/issues" },
};

export const dynamic = "force-dynamic";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    before?: string;
    category?: string;
    status?: string;
    view?: string;
  }>;
}) {
  const { before, category, status, view } = await searchParams;
  const isMapView = view === "map";

  const viewer = await getSessionUser();

  const validCategory = issueCategories.find((c) => c === category) as IssueCategory | undefined;
  const validStatus = issueStatuses.find((s) => s === status) as IssueStatus | undefined;

  const [page, counts, mappedRaw] = await Promise.all([
    getIssues(before, { category: validCategory, status: validStatus }),
    getIssueCounts(),
    isMapView ? getMappedIssues() : Promise.resolve([]),
  ]);

  const mappedIssues: MappedIssueItem[] = mappedRaw
    .filter((i): i is IssueSummary & { latitude: number; longitude: number } =>
      typeof i.latitude === "number" && typeof i.longitude === "number"
    )
    .map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      category: i.category,
      status: i.status,
      location_text: i.location_text,
      latitude: i.latitude,
      longitude: i.longitude,
      confirm_count: i.confirm_count,
      community: i.community,
      reporter: i.reporter,
    }));

  const buildQuery = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { category, status, view, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    const str = q.toString();
    return str ? `?${str}` : "";
  };

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/communities"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken sm:inline-flex"
            >
              Communities
            </Link>
            <Link
              href="/feed"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken sm:inline-flex"
            >
              Feed
            </Link>
            <Link
              href={viewer ? "/issues/new" : "/login?next=%2Fissues%2Fnew"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Plus className="size-4" aria-hidden="true" />
              Report an issue
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted-foreground">
              <Link href="/" className="hover:underline">
                Ezike Oba
              </Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">Issues</span>
            </nav>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Community Issues
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track and report broken infrastructure across Igbo Eze North — boreholes,
              washed-out roads, transformers, clinics and schools.
            </p>
          </div>

          {/* List vs Map toggle */}
          <div className="flex items-center rounded-lg border border-border p-1 bg-surface-sunken">
            <Link
              href={`/issues${buildQuery({ view: undefined })}`}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !isMapView
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="size-3.5" aria-hidden="true" />
              List View
            </Link>
            <Link
              href={`/issues${buildQuery({ view: "map" })}`}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isMapView
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapPin className="size-3.5" aria-hidden="true" />
              Map View
            </Link>
          </div>
        </div>

        {/* Status Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href={`/issues${buildQuery({ status: undefined, before: undefined })}`}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              !validStatus
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            All statuses
          </Link>
          {issueStatuses.map((s) => {
            const active = validStatus === s;
            const count = counts?.[s];
            return (
              <Link
                key={s}
                href={`/issues${buildQuery({ status: s, before: undefined })}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
                }`}
              >
                <span>{ISSUE_STATUS_LABEL[s]}</span>
                {count !== undefined && count > 0 ? (
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-surface-sunken text-foreground"
                  }`}>
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {/* Category Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs border-b border-border pb-4">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Category:</span>
          <Link
            href={`/issues${buildQuery({ category: undefined, before: undefined })}`}
            className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
              !validCategory
                ? "bg-foreground text-background"
                : "bg-surface-sunken text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </Link>
          {issueCategories.map((c) => {
            const active = validCategory === c;
            return (
              <Link
                key={c}
                href={`/issues${buildQuery({ category: c, before: undefined })}`}
                className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-surface-sunken text-muted-foreground hover:text-foreground"
                }`}
              >
                {ISSUE_CATEGORY_LABEL[c]}
              </Link>
            );
          })}
        </div>

        {/* Main Content Area */}
        {isMapView ? (
          <div className="mt-6">
            <IssuesMap issues={mappedIssues} />
          </div>
        ) : (
          <section aria-label="Issue reports" className="mt-6 space-y-4">
            {!page.available ? (
              <ErrorState
                title="Issues could not be loaded"
                description="This is usually a temporary connection problem. Please try again shortly."
              />
            ) : page.issues.length === 0 ? (
              <EmptyState
                icon={<AlertCircle className="size-6" />}
                title={validCategory || validStatus ? "No matching issues" : "No issues reported yet"}
                description={
                  validCategory || validStatus
                    ? "Try choosing a different category or status filter."
                    : "When neighbours or community leaders report broken infrastructure, it appears here."
                }
                action={
                  <Link
                    href={viewer ? "/issues/new" : "/login?next=%2Fissues%2Fnew"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Report the first issue
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {page.issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            )}

            {page.nextCursor ? (
              <div className="mt-8 flex justify-center">
                <Link
                  href={`/issues${buildQuery({ before: page.nextCursor })}`}
                  className="inline-flex h-10 items-center rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken"
                >
                  Show older reports
                </Link>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </>
  );
}
