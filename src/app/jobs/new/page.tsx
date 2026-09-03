import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getVillageOptions } from "@/features/geo/queries";
import { CreateJobForm } from "@/features/jobs/components/create-job-form";

export const metadata: Metadata = {
  title: "Post a job",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  await requireUser("/jobs/new");
  const villages = await getVillageOptions();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to jobs
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Post a job
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Tell Igbo-Eze North what you need doing, and how to reach you.
        </p>

        <CreateJobForm villages={villages} />
      </main>
    </>
  );
}
