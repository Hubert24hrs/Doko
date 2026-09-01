import type { Metadata } from "next";
import Link from "next/link";
import { Lock, MapPin, Users, UsersRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import { listGroups, listMyGroups } from "@/features/groups/queries";
import { GROUP_KIND_LABEL } from "@/features/groups/schemas";
import type { GroupSummary } from "@/features/groups/queries";

export const metadata: Metadata = {
  title: "Groups",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function GroupCard({ group }: { group: GroupSummary }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            href={`/groups/${group.slug}`}
            className="font-medium text-foreground hover:underline"
          >
            {group.name}
          </Link>
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral">{GROUP_KIND_LABEL[group.kind]}</Badge>
            {group.visibility === "private" ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title="Private group"
              >
                <Lock className="size-3" aria-hidden="true" />
                <span className="sr-only">Private group</span>
                Private
              </span>
            ) : null}
          </div>
        </div>

        {group.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {group.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" />
            {group.member_count.toLocaleString("en-NG")}{" "}
            {group.member_count === 1 ? "member" : "members"}
          </span>
          {group.communityName ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {group.communityName}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function GroupsPage() {
  await requireUser("/groups");

  const [all, mine] = await Promise.all([listGroups(), listMyGroups()]);
  const mineIds = new Set(mine.map((g) => g.id));
  const discover = all.filter((g) => !mineIds.has(g.id));

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/feed"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Feed
            </Link>
            <Link
              href="/groups/new"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Start a group
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Groups
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Village meetings, youth associations, trades and interests across
          Igbo-Eze North.
        </p>

        {mine.length > 0 ? (
          <section aria-labelledby="mine-heading" className="mt-8">
            <h2
              id="mine-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Your groups
            </h2>
            <div className="space-y-3">
              {mine.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="discover-heading" className="mt-8">
          <h2
            id="discover-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {mine.length > 0 ? "Discover more" : "All groups"}
          </h2>

          {discover.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="size-6" />}
              title={
                mine.length > 0
                  ? "No other groups yet"
                  : "No groups have been created yet"
              }
              description="Start one for your village, your trade or anything the community needs."
              action={
                <Link
                  href="/groups/new"
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Start a group
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {discover.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
