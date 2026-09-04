import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper, Compass, UserRound, MapPin, ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";

export const metadata: Metadata = {
  title: "Welcome to Ezike Oba",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await requireUser("/welcome");
  const profile = user.profile;

  // Greet by first name: "Welcome, Idoko" reads warmer than the full legal
  // name the form collected.
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "friend";
  const hasVillage = Boolean(profile?.village_id);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-eo-green-50 text-primary">
            <PartyPopper className="size-7" aria-hidden="true" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Nnọọ, {firstName}!
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Welcome to Ezike Oba. Your account is ready, and you are now part of
            the digital home of Igbo Eze North — alongside neighbours from
            Enugu Ezike, Ette and every village between them.
          </p>

          {profile?.username ? (
            <div className="mt-4 flex justify-center">
              <Badge variant="primary">@{profile.username}</Badge>
            </div>
          ) : null}
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          A good place to start
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <NextStep
            href="/communities"
            icon={<Compass className="size-5" aria-hidden="true" />}
            title="Explore the communities"
            body="Two towns, four districts and thirty-one villages, with their council wards."
          />
          <NextStep
            href="/settings"
            icon={
              hasVillage ? (
                <UserRound className="size-5" aria-hidden="true" />
              ) : (
                <MapPin className="size-5" aria-hidden="true" />
              )
            }
            title={hasVillage ? "Finish your profile" : "Add your village"}
            body={
              hasVillage
                ? "Add a photo, a short bio and what you do, so neighbours recognise you."
                : "Entirely optional — but it helps neighbours from your village find you."
            }
          />
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/home"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Go to your home
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>

        <Card className="mt-10 border-dashed">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">
                One thing worth knowing:
              </strong>{" "}
              your profile is visible to everyone by default, including people
              who are not signed in. You can restrict it to your community, or
              to just yourself, at any time in{" "}
              <Link href="/settings" className="text-primary hover:underline">
                settings
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function NextStep({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-card border border-border bg-surface-raised p-5 transition-colors hover:border-border-strong"
    >
      <div className="mb-2 text-primary">{icon}</div>
      <p className="font-medium text-foreground group-hover:text-primary">
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
