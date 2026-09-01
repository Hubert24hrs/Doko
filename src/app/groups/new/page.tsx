import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getVillageOptions } from "@/features/geo/queries";
import { CreateGroupForm } from "@/features/groups/components/create-group-form";

export const metadata: Metadata = {
  title: "Start a group",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  await requireUser("/groups/new");
  const villages = await getVillageOptions();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/groups"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All groups
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Start a group
        </h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          You will be its first owner, and can add others later.
        </p>

        <Card>
          <CardContent className="pt-6">
            <CreateGroupForm villages={villages} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
