import type { Metadata } from "next";
import Link from "next/link";
import { Compass, MapPin, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { requireUser, isStaff } from "@/features/auth/session";
import { signOutAction } from "@/features/auth/actions";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser("/home");
  const profile = user.profile;
  const displayName = profile?.full_name ?? "there";

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {isStaff(user) ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Admin
              </Link>
            ) : null}
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome, {displayName}
          </h1>
          {profile?.is_verified ? <VerifiedBadge showLabel /> : null}
          {profile?.username ? (
            <Badge variant="neutral">@{profile.username}</Badge>
          ) : null}
        </div>

        {/*
          The social feed arrives in Phase 2. Rather than showing a fake feed,
          this points members at what genuinely works today.
        */}
        <Card className="mb-6 border-dashed">
          <CardHeader>
            <CardTitle as="h2">Your feed is being built</CardTitle>
            <CardDescription>
              Posts, comments and community groups arrive in the next phase.
              Meanwhile, the community directory below is live.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="mb-1 text-primary">
                <Compass className="size-5" aria-hidden="true" />
              </div>
              <CardTitle as="h2">Explore Igbo-Eze North</CardTitle>
              <CardDescription>
                Browse every town, district and village in the directory.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/communities"
                className="text-sm font-medium text-primary hover:underline"
              >
                Open the directory
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-1 text-primary">
                <MapPin className="size-5" aria-hidden="true" />
              </div>
              <CardTitle as="h2">Your community</CardTitle>
              <CardDescription>
                {profile?.village_id
                  ? "You have chosen a village. You can change it any time."
                  : "You have not chosen a village. That is completely optional."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/settings"
                className="text-sm font-medium text-primary hover:underline"
              >
                Update your profile
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
