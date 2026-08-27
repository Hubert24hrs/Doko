import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { requireAdmin } from "@/features/auth/session";
import { getGeoTree, type GeoNode } from "@/features/geo/queries";

export const metadata: Metadata = {
  title: "Communities · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface FlatRow {
  node: GeoNode;
  depth: number;
  path: string;
}

/** Depth-first flatten, so the table reads as an indented outline. */
function flatten(nodes: GeoNode[], depth = 0, parentPath = ""): FlatRow[] {
  return nodes.flatMap((node) => {
    const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
    return [
      { node, depth, path },
      ...flatten(node.children, depth + 1, path),
    ];
  });
}

export default async function AdminCommunitiesPage() {
  await requireAdmin();
  const tree = await getGeoTree();
  const rows = flatten(tree);

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Communities</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Community directory
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        The full geographic tree for Igbo-Eze North. {rows.length} entities.
        Editing, moving and merging are enforced by database policy — a
        community admin can only change their own subtree.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No geographic entities yet"
          description="Apply supabase/seed.sql to load the Igbo-Eze North directory."
        />
      ) : (
        <Card className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                All geographic entities, as an indented tree
              </caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Name</th>
                  <th scope="col" className="px-5 py-3 font-medium">Kind</th>
                  <th scope="col" className="px-5 py-3 font-medium">Slug</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node, depth, path }) => (
                  <tr key={node.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-2.5 font-normal text-foreground">
                      <span
                        style={{ paddingLeft: `${depth * 1.25}rem` }}
                        className="inline-block"
                      >
                        {node.name}
                      </span>
                      <span className="sr-only"> — {path}</span>
                    </th>
                    <td className="px-5 py-2.5">
                      <Badge variant="neutral">{node.kind}</Badge>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                      {node.slug}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {node.status}
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
