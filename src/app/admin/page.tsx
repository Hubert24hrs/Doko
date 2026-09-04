import type { Metadata } from "next";
import Link from "next/link";
import { Users, MapPin, ScrollText, ShieldCheck, AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { requireStaff } from "@/features/auth/session";
import { getAdminOverview } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireStaff();
  const overview = await getAdminOverview();

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/home" className="rounded-lg">
              <Logo showWordmark={false} />
            </Link>
            <span className="text-sm font-semibold text-foreground">
              Administration
            </span>
            <Badge variant="primary">
              {user.roles.includes("super_admin") ? "Super admin" : "Staff"}
            </Badge>
          </div>
          <Link
            href="/home"
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
          >
            Back to Ezike Oba
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Platform overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live figures from the database.
        </p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Members"
            value={overview.memberCount}
            icon={<Users className="size-5" aria-hidden="true" />}
          />
          <StatCard
            label="Geographic entities"
            value={overview.geoCount}
            icon={<MapPin className="size-5" aria-hidden="true" />}
          />
          <StatCard
            label="Verified members"
            value={overview.verifiedCount}
            icon={<ShieldCheck className="size-5" aria-hidden="true" />}
          />
          <StatCard
            label="Reported issues"
            value={overview.issueCount}
            icon={<AlertTriangle className="size-5" aria-hidden="true" />}
          />
          <StatCard
            label="Audit entries"
            value={overview.auditCount}
            icon={<ScrollText className="size-5" aria-hidden="true" />}
          />
        </dl>

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">
            Administration Modules
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle as="h3">Communities</CardTitle>
                <CardDescription>
                  Create, rename, move, merge and archive towns, districts and villages.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/admin/communities"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Manage directory &rarr;
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h3">Members &amp; Badges</CardTitle>
                <CardDescription>
                  Review registered citizens, manage verified trust badges, and handle suspensions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/admin/members"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Manage members &rarr;
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h3">LGA Issues Ops</CardTitle>
                <CardDescription>
                  Administrative oversight of all community infrastructure reports and statuses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/admin/issues"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Track issues &rarr;
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h3">Moderation &amp; Audit</CardTitle>
                <CardDescription>
                  Review system audit trail, administrative actions, and moderation records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/admin/moderation"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View audit trail &rarr;
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">
            Recent administrative actions
          </h2>

          {overview.recentAudits.length === 0 ? (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">
                  No administrative actions have been recorded yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Most recent administrative actions
                  </caption>
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Actor</th>
                      <th scope="col" className="px-5 py-3 font-medium">Action</th>
                      <th scope="col" className="px-5 py-3 font-medium">Entity</th>
                      <th scope="col" className="px-5 py-3 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentAudits.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 text-foreground">
                          {entry.actor_username ? `@${entry.actor_username}` : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-foreground">
                          {entry.action}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {entry.entity_type}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          <time dateTime={entry.created_at}>
                            {new Date(entry.created_at).toLocaleString("en-NG")}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 text-primary" aria-hidden="true">
          {icon}
        </div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-3xl font-bold tabular-nums text-foreground">
          {value ?? "—"}
        </dd>
      </CardContent>
    </Card>
  );
}
