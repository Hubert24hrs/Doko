import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";

import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/features/auth/session";
import { getIssue } from "@/features/issues/queries";
import { getIssueImages } from "@/features/issues/media-queries";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
} from "@/features/issues/schemas";
import { IssueGallery } from "@/features/issues/components/issue-gallery";
import { ConfirmButton } from "@/features/issues/components/confirm-button";
import { StatusControl } from "@/features/issues/components/status-control";
import { ReporterControls } from "@/features/issues/components/reporter-controls";
import { MiniMap, type MappedIssueItem } from "@/components/map";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const issue = await getIssue(id);

  if (!issue) {
    return { title: "Issue not found", robots: { index: false, follow: false } };
  }

  return {
    title: `${issue.title} — Community Issues`,
    description: issue.description.slice(0, 160),
    alternates: { canonical: `/issues/${issue.id}` },
  };
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [issue, viewer] = await Promise.all([getIssue(id), getSessionUser()]);
  if (!issue) notFound();

  const isReporter = viewer?.id === issue.reporter_id;
  const imagesByIssue = await getIssueImages([id]);
  const images = imagesByIssue.get(id) ?? [];

  const settled = issue.status === "resolved";

  const mappedItem: MappedIssueItem | null =
    typeof issue.latitude === "number" && typeof issue.longitude === "number"
      ? {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          category: issue.category,
          status: issue.status,
          location_text: issue.location_text,
          latitude: issue.latitude,
          longitude: issue.longitude,
          confirm_count: issue.confirm_count,
          community: issue.community,
          reporter: issue.reporter,
        }
      : null;

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href={viewer ? "/home" : "/"} className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/issues"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to issues
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            Ezike Oba
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/issues" className="hover:underline">
            Issues
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page" className="line-clamp-1">{issue.title}</span>
        </nav>

        {/* Issue Header */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={settled ? "primary" : "neutral"}>
              {ISSUE_STATUS_LABEL[issue.status]}
            </Badge>
            <Badge variant="neutral">
              {ISSUE_CATEGORY_LABEL[issue.category]}
            </Badge>
            {issue.community ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden="true" />
                {issue.community.name}
              </span>
            ) : null}
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {issue.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {issue.reporter ? (
              <div className="flex items-center gap-1">
                <span>Reported by</span>
                <Link
                  href={`/members/${issue.reporter.username}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {issue.reporter.full_name}
                </Link>
                {issue.reporter.is_verified ? <VerifiedBadge /> : null}
              </div>
            ) : null}

            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden="true" />
              {new Date(issue.created_at).toLocaleDateString("en-NG", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>

            {issue.location_text ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {issue.location_text}
              </span>
            ) : null}
          </div>
        </div>

        {/* Status note if an admin has left one */}
        {issue.status_note ? (
          <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
            <p className="font-semibold text-primary">Status update from leadership</p>
            <p className="mt-1">{issue.status_note}</p>
          </div>
        ) : null}

        {/* Photos */}
        {images.length > 0 ? (
          <div className="mt-6">
            <IssueGallery images={images} />
          </div>
        ) : null}

        {/* Description */}
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Description
          </h2>
          <p className="whitespace-pre-line text-foreground text-sm leading-relaxed">
            {issue.description}
          </p>
        </div>

        {/* Map pin if coordinates are attached */}
        {mappedItem ? (
          <div className="mt-8 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              Location on map
            </h2>
            <MiniMap issue={mappedItem} />
          </div>
        ) : null}

        {/* Confirmation Action */}
        <div className="mt-8 rounded-xl border border-border bg-surface p-5">
          <ConfirmButton
            issueId={issue.id}
            confirmed={issue.viewerConfirmed}
            count={issue.confirm_count}
          />
        </div>

        {/* Admin Controls */}
        {issue.viewerAdministers ? (
          <div className="mt-8">
            <StatusControl
              issueId={issue.id}
              status={issue.status}
              note={issue.status_note}
            />
          </div>
        ) : null}

        {/* Reporter Controls (Withdrawal) */}
        {isReporter ? (
          <ReporterControls issueId={issue.id} />
        ) : null}
      </main>
    </>
  );
}
