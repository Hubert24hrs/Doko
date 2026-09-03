import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getVillageOptions } from "@/features/geo/queries";
import { ReportIssueForm } from "@/features/issues/components/report-issue-form";

export const metadata: Metadata = {
  title: "Report a Community Issue",
  description:
    "Report broken infrastructure in Igbo-Eze North: boreholes, roads, transformers, clinics or schools.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewIssuePage() {
  await requireUser("/issues/new");
  const villages = await getVillageOptions();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
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

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            Ezike Oba
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/issues" className="hover:underline">
            Issues
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">Report an issue</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Report an issue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A broken borehole, washed-out road, power transformer fault, or health centre
          problem. Community leaders and neighbours will be able to see and confirm it.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <ReportIssueForm villages={villages} />
        </div>
      </main>
    </>
  );
}
