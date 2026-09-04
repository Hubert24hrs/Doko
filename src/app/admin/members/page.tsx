import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, UserX, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireAdmin } from "@/features/auth/session";
import { getAdminMembers } from "@/features/admin/queries";
import {
  toggleVerificationAction,
  toggleSuspensionAction,
} from "@/features/admin/actions";

export const metadata: Metadata = {
  title: "Members & Verification — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdmin();
  const { q, status } = await searchParams;

  const verifiedFilter = status === "verified" ? true : status === "unverified" ? false : undefined;
  const suspendedFilter = status === "suspended" ? true : undefined;

  const members = await getAdminMembers({
    query: q,
    verified: verifiedFilter,
    suspended: suspendedFilter,
  });

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Members &amp; Verification</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Members &amp; Verification
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review registered citizens, manage verified trust badges, and enforce community standards.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name or @username"
              className="h-9 w-64 rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">Search</Button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href="/admin/members"
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              !status
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            All members
          </Link>
          <Link
            href="/admin/members?status=verified"
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              status === "verified"
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            Verified only
          </Link>
          <Link
            href="/admin/members?status=unverified"
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              status === "unverified"
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            Unverified
          </Link>
          <Link
            href="/admin/members?status=suspended"
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              status === "suspended"
                ? "bg-danger text-white"
                : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            Suspended
          </Link>
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No members match that search"
          description="Try changing your search terms or filters."
        />
      ) : (
        <Card className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Members list</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Member</th>
                  <th scope="col" className="px-5 py-3 font-medium">Community</th>
                  <th scope="col" className="px-5 py-3 font-medium">Roles</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const roles = member.roles?.map((r) => r.role) ?? [];

                  return (
                    <tr key={member.id} className="border-b border-border last:border-0 hover:bg-surface-sunken/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Link href={`/members/${member.username}`} className="hover:underline">
                            {member.full_name}
                          </Link>
                          {member.is_verified ? <VerifiedBadge /> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">@{member.username}</p>
                      </td>

                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {member.village?.name ?? "—"}
                      </td>

                      <td className="px-5 py-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {roles.length > 0 ? (
                            roles.map((r) => (
                              <Badge key={r} variant={r.includes("admin") ? "primary" : "neutral"}>
                                {r}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">citizen</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3 text-xs">
                        {member.is_suspended ? (
                          <Badge variant="danger">Suspended</Badge>
                        ) : member.is_verified ? (
                          <Badge variant="primary">Verified</Badge>
                        ) : (
                          <Badge variant="neutral">Active</Badge>
                        )}
                      </td>

                      <td className="px-5 py-3 text-right text-xs">
                        <div className="flex items-center justify-end gap-2">
                          {/* Toggle verification */}
                          <form action={async (formData) => {
                            "use server";
                            await toggleVerificationAction({ ok: false }, formData);
                          }}>
                            <input type="hidden" name="memberId" value={member.id} />
                            <input
                              type="hidden"
                              name="intent"
                              value={member.is_verified ? "unverify" : "verify"}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant={member.is_verified ? "outline" : "primary"}
                              className="h-7 px-2.5 text-xs"
                            >
                              {member.is_verified ? "Revoke badge" : "Grant badge"}
                            </Button>
                          </form>

                          {/* Toggle suspension */}
                          <form action={async (formData) => {
                            "use server";
                            await toggleSuspensionAction({ ok: false }, formData);
                          }}>
                            <input type="hidden" name="memberId" value={member.id} />
                            <input
                              type="hidden"
                              name="intent"
                              value={member.is_suspended ? "reinstate" : "suspend"}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className={`h-7 px-2 text-xs ${
                                member.is_suspended
                                  ? "text-primary hover:bg-primary/10"
                                  : "text-danger hover:bg-danger/10"
                              }`}
                            >
                              {member.is_suspended ? "Reinstate" : "Suspend"}
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
