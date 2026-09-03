import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getVillageOptions } from "@/features/geo/queries";
import { CreateEventForm } from "@/features/events/components/create-event-form";

export const metadata: Metadata = {
  title: "Add an event",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireUser("/events/new");
  const villages = await getVillageOptions();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to events
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Add an event
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Tell Igbo-Eze North what is happening, and when.
        </p>

        <CreateEventForm villages={villages} />
      </main>
    </>
  );
}
