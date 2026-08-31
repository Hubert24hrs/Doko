import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { getVillageOptions } from "@/features/geo/queries";
import { ProfileForm } from "@/features/profile/components/profile-form";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const villages = await getVillageOptions();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <Link
            href="/home"
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            Back
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Your profile
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update how you appear across Ezike Oba.
        </p>

        <Card className="mt-6">
          <CardContent className="pt-6">
            {user.profile ? (
              <ProfileForm profile={user.profile} villages={villages} />
            ) : (
              // Signed in, but the profile row is missing — the signup trigger
              // did not run. Say so plainly rather than rendering a form whose
              // save would fail.
              <ErrorState
                title="Your profile could not be loaded"
                description="Your account exists but its profile record is missing. Please contact an administrator so it can be restored."
              />
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
