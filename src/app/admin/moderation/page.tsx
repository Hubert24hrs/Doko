import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/features/auth/session";
import { getAdminAudits } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: "Moderation & Audit — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  await requireStaff();
  const audits = await getAdminAudits(100);

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Moderation &amp; Audit Trail</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Moderation &amp; Audit Trail
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only record of all administrative decisions, moderation actions, and privilege updates.
          </p>
        </div>
      </div>

      {audits.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No administrative audit events"
          description="Administrative actions will be automatically recorded here."
        />
      ) : (
        <Card className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Audit trail of actions</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Actor</th>
                  <th scope="col" className="px-5 py-3 font-medium">Action</th>
                  <th scope="col" className="px-5 py-3 font-medium">Entity</th>
                  <th scope="col" className="px-5 py-3 font-medium">Details / ID</th>
                  <th scope="col" className="px-5 py-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-surface-sunken/40">
                    <td className="px-5 py-3 text-xs font-semibold text-foreground">
                      {entry.actor_username ? `@${entry.actor_username}` : "System"}
                    </td>

                    <td className="px-5 py-3 font-mono text-xs text-primary font-medium">
                      {entry.action}
                    </td>

                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {entry.entity_type}
                    </td>

                    <td className="px-5 py-3 text-xs font-mono text-muted-foreground line-clamp-1 max-w-xs">
                      {entry.entity_id ?? JSON.stringify(entry.metadata)}
                    </td>

                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      <time dateTime={entry.created_at}>
                        {new Date(entry.created_at).toLocaleString("en-NG", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
