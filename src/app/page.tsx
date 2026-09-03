import Link from "next/link";
import { ArrowRight, MapPin, Users, Building2, CalendarDays } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { getCommunitySnapshot } from "@/features/geo/snapshot";

/**
 * Public landing page.
 *
 * Server-rendered per request: it reads live counts from the database, and the
 * page must not be baked at build time when no database is reachable.
 */
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const snapshot = await getCommunitySnapshot();

  return (
    <>
      <header className="border-b border-border">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4"
        >
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/issues"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken sm:inline-flex"
            >
              Issues
            </Link>
            <Link
              href="/communities"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken sm:inline-flex"
            >
              Communities
            </Link>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Join Ezike Oba
            </Link>
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1">
        {/* Hero ------------------------------------------------------------ */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden="true" />
              Igbo-Eze North, Enugu State
            </p>
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-6xl">
              One digital home for the people of{" "}
              <span className="text-primary">Igbo-Eze North</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Ezike Oba connects citizens, villages, towns, businesses and
              opportunities across Enugu-Ezike and Ette — so the community can
              find each other, share what matters and build together.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Join the community
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <Link
                href="/communities"
                className="inline-flex h-12 items-center rounded-lg border border-border-strong px-6 font-medium text-foreground transition-colors hover:bg-surface-sunken"
              >
                Explore communities
              </Link>
            </div>
          </div>
        </section>

        {/* Live snapshot --------------------------------------------------- */}
        <section
          aria-labelledby="snapshot-heading"
          className="mx-auto max-w-6xl px-4 py-16"
        >
          <h2
            id="snapshot-heading"
            className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
          >
            The community, today
          </h2>

          {snapshot.available ? (
            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Towns" value={snapshot.towns} icon={<Building2 />} />
              <StatCard label="Districts" value={snapshot.districts} icon={<MapPin />} />
              <StatCard label="Villages" value={snapshot.villages} icon={<Users />} />
              <StatCard label="Council wards" value={snapshot.wards} icon={<CalendarDays />} />
            </dl>
          ) : (
            <Card className="mt-6">
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">
                  Community statistics are unavailable right now. The directory
                  will appear here once the database connection is configured.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo showWordmark />
          <p>Built for the people of Igbo-Eze North.</p>
        </div>
      </footer>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 text-primary [&_svg]:size-5" aria-hidden="true">
          {icon}
        </div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-3xl font-bold tabular-nums text-foreground">
          {value}
        </dd>
      </CardContent>
    </Card>
  );
}
