import type { Metadata } from "next";
import Link from "next/link";
import {
    ShieldCheck,
    Search,
  Sparkles,
  Award,
  Clock,
  UserCheck,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireAdmin } from "@/features/auth/session";
import {
  getAdminMembers,
  getAdminVerificationRequests,
} from "@/features/admin/queries";
import {
  toggleVerificationAction,
  toggleVerificationDelegateAction,
  reviewVerificationRequestAction,
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
  searchParams: Promise<{ q?: string; status?: string; tab?: string }>;
}) {
  await requireAdmin();
  const { q, status, tab } = await searchParams;

  const currentTab = tab ?? "members";
  const verifiedFilter =
    status === "verified" ? true : status === "unverified" ? false : undefined;
  const suspendedFilter = status === "suspended" ? true : undefined;

  const [members, pendingRequests] = await Promise.all([
    getAdminMembers({
      query: q,
      verified: verifiedFilter,
      suspended: suspendedFilter,
    }),
    getAdminVerificationRequests({ status: "pending" }),
  ]);

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
            Manage Golden &amp; Blue verification tiers, review pending requests, and delegate verification authority.
          </p>
        </div>
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <div className="mt-6 flex border-b border-border">
        <Link
          href="/admin/members?tab=members"
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            currentTab === "members"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          }`}
        >
          <span>All Members</span>
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground">
            {members.length}
          </span>
        </Link>
        <Link
          href="/admin/members?tab=requests"
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            currentTab === "requests"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          }`}
        >
          <Clock className="size-4" />
          <span>Pending Verification Requests</span>
          {pendingRequests.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {pendingRequests.length}
            </span>
          )}
        </Link>
      </div>

      {currentTab === "requests" ? (
        /* ================= PENDING REQUESTS TAB ================= */
        <div className="mt-6">
          {pendingRequests.length === 0 ? (
            <EmptyState
              title="No pending verification requests"
              description="When members apply for Golden or Blue verification from the verification page, their requests will appear here for review."
            />
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((req) => (
                <Card key={req.id} className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground">
                          {req.profile?.full_name ?? "Citizen"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          @{req.profile?.username}
                        </span>
                        <VerifiedBadge
                          type={req.tier}
                          ticker
                          label={req.tier === "gold" ? "Requested: Golden" : "Requested: Blue"}
                        />
                      </div>

                      {(req.organization || req.role_title) && (
                        <p className="mt-1 text-xs font-medium text-foreground">
                          {req.role_title} {req.organization ? `at ${req.organization}` : ""}
                        </p>
                      )}

                      {req.notes && (
                        <p className="mt-2 text-xs text-muted-foreground bg-surface-sunken p-3 rounded-lg border border-border">
                          &ldquo;{req.notes}&rdquo;
                        </p>
                      )}

                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Submitted: {new Date(req.created_at).toLocaleString("en-GB")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Approve as Gold */}
                      <form action={async (formData) => {
                        "use server";
                        await reviewVerificationRequestAction({ ok: false }, formData);
                      }}>
                        <input type="hidden" name="requestId" value={req.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <input type="hidden" name="tier" value="gold" />
                        <Button
                          type="submit"
                          size="sm"
                          className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold gap-1"
                        >
                          <Sparkles className="size-3.5" />
                          <span>Approve Gold</span>
                        </Button>
                      </form>

                      {/* Approve as Blue */}
                      <form action={async (formData) => {
                        "use server";
                        await reviewVerificationRequestAction({ ok: false }, formData);
                      }}>
                        <input type="hidden" name="requestId" value={req.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <input type="hidden" name="tier" value="blue" />
                        <Button
                          type="submit"
                          size="sm"
                          className="bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300 border border-sky-500/30 text-xs font-semibold gap-1"
                        >
                          <ShieldCheck className="size-3.5" />
                          <span>Approve Blue</span>
                        </Button>
                      </form>

                      {/* Reject */}
                      <form action={async (formData) => {
                        "use server";
                        await reviewVerificationRequestAction({ ok: false }, formData);
                      }}>
                        <input type="hidden" name="requestId" value={req.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className="text-xs text-danger hover:bg-danger/10"
                        >
                          Decline
                        </Button>
                      </form>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ================= ALL MEMBERS TAB ================= */
        <>
          {/* Filter bar */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="tab" value="members" />
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
                href="/admin/members?tab=members"
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  !status
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
                }`}
              >
                All members
              </Link>
              <Link
                href="/admin/members?tab=members&status=verified"
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  status === "verified"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
                }`}
              >
                Verified only
              </Link>
              <Link
                href="/admin/members?tab=members&status=unverified"
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  status === "unverified"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground hover:bg-surface-sunken"
                }`}
              >
                Unverified
              </Link>
              <Link
                href="/admin/members?tab=members&status=suspended"
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
                      <th scope="col" className="px-5 py-3 font-medium">Roles &amp; Authority</th>
                      <th scope="col" className="px-5 py-3 font-medium">Verification Status</th>
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
                              {member.is_verified ? (
                                <VerifiedBadge type={member.verification_type} />
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">@{member.username}</p>
                          </td>

                          <td className="px-5 py-3 text-xs text-muted-foreground">
                            {member.village?.name ?? "—"}
                          </td>

                          <td className="px-5 py-3 text-xs">
                            <div className="flex flex-wrap items-center gap-1">
                              {roles.length > 0 ? (
                                roles.map((r) => (
                                  <Badge key={r} variant={r.includes("admin") ? "primary" : "neutral"}>
                                    {r}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">citizen</span>
                              )}
                              {member.is_delegate && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300 border border-purple-400/30">
                                  <UserCheck className="size-3" />
                                  <span>Verifier Delegate</span>
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-3 text-xs">
                            {member.is_suspended ? (
                              <Badge variant="danger">Suspended</Badge>
                            ) : member.is_verified ? (
                              <VerifiedBadge
                                type={member.verification_type}
                                ticker
                                label={member.verification_type === "gold" ? "Gold Official" : "Blue Verified"}
                              />
                            ) : (
                              <span className="text-muted-foreground">Unverified</span>
                            )}
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Verification Controls */}
                              {member.is_verified ? (
                                <>
                                  {/* Toggle between tiers or unverify */}
                                  {member.verification_type !== "gold" && (
                                    <form action={async (formData) => {
                                      "use server";
                                      await toggleVerificationAction({ ok: false }, formData);
                                    }}>
                                      <input type="hidden" name="memberId" value={member.id} />
                                      <input type="hidden" name="intent" value="verify" />
                                      <input type="hidden" name="tier" value="gold" />
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2 text-amber-600 dark:text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                                      >
                                        Upgrade to Gold
                                      </Button>
                                    </form>
                                  )}
                                  <form action={async (formData) => {
                                    "use server";
                                    await toggleVerificationAction({ ok: false }, formData);
                                  }}>
                                    <input type="hidden" name="memberId" value={member.id} />
                                    <input type="hidden" name="intent" value="unverify" />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-7 px-2 text-muted-foreground hover:text-danger"
                                    >
                                      Revoke Badge
                                    </Button>
                                  </form>
                                </>
                              ) : (
                                <>
                                  {/* Verify Gold */}
                                  <form action={async (formData) => {
                                    "use server";
                                    await toggleVerificationAction({ ok: false }, formData);
                                  }}>
                                    <input type="hidden" name="memberId" value={member.id} />
                                    <input type="hidden" name="intent" value="verify" />
                                    <input type="hidden" name="tier" value="gold" />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      className="text-xs h-7 px-2 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 border border-amber-500/30 font-semibold gap-1"
                                    >
                                      <Sparkles className="size-3" />
                                      <span>Verify Gold</span>
                                    </Button>
                                  </form>

                                  {/* Verify Blue */}
                                  <form action={async (formData) => {
                                    "use server";
                                    await toggleVerificationAction({ ok: false }, formData);
                                  }}>
                                    <input type="hidden" name="memberId" value={member.id} />
                                    <input type="hidden" name="intent" value="verify" />
                                    <input type="hidden" name="tier" value="blue" />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      className="text-xs h-7 px-2 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300 border border-sky-500/30 font-semibold gap-1"
                                    >
                                      <ShieldCheck className="size-3" />
                                      <span>Verify Blue</span>
                                    </Button>
                                  </form>
                                </>
                              )}

                              {/* Delegate Verification Authority Toggle */}
                              {!roles.includes("admin") && !roles.includes("super_admin") && (
                                <form action={async (formData) => {
                                  "use server";
                                  await toggleVerificationDelegateAction({ ok: false }, formData);
                                }}>
                                  <input type="hidden" name="memberId" value={member.id} />
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value={member.is_delegate ? "revoke" : "delegate"}
                                  />
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="ghost"
                                    className={`text-xs h-7 px-2 ${
                                      member.is_delegate
                                        ? "text-purple-600 hover:text-danger dark:text-purple-400"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                    title={member.is_delegate ? "Revoke verification delegation" : "Delegate verification capability to this member"}
                                  >
                                    <Award className="size-3.5 mr-1" />
                                    <span>{member.is_delegate ? "Revoke Delegate" : "Delegate"}</span>
                                  </Button>
                                </form>
                              )}

                              {/* Suspend / Reinstate Controls */}
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
                                  className={`text-xs h-7 px-2 ${
                                    member.is_suspended
                                      ? "text-eo-green-600 hover:underline"
                                      : "text-muted-foreground hover:text-danger"
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
        </>
      )}
    </main>
  );
}
