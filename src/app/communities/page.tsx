import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { getGeoTree, type GeoNode } from "@/features/geo/queries";

export const metadata: Metadata = {
  title: "Communities of Igbo-Eze North",
  description:
    "Every town, district and village of Igbo-Eze North Local Government Area, Enugu State.",
  alternates: { canonical: "/communities" },
};

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  lga: "Local Government Area",
  town: "Town",
  autonomous_community: "Autonomous community",
  district: "District",
  village: "Village",
  area: "Ward",
};

export default async function CommunitiesPage() {
  let tree: GeoNode[];
  try {
    tree = await getGeoTree();
  } catch {
    return (
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Communities</h1>
        <ErrorState
          title="The directory could not be loaded"
          description="This is usually a temporary connection problem. Please try again shortly."
        />
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Ezike Oba
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Communities</span>
      </nav>

      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Communities of Igbo-Eze North
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        The towns, districts, villages and council wards of Igbo-Eze North Local
        Government Area, Enugu State. Administrators keep this directory
        accurate — if something is missing or misspelled, it can be corrected.
      </p>

      {tree.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<MapPin className="size-6" />}
          title="The directory is empty"
          description="No communities have been added yet. Once the seed data is applied, every town, district and village will be listed here."
        />
      ) : (
        <div className="mt-8 space-y-6">
          {tree.map((node) => (
            <GeoBranch key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </main>
  );
}

function GeoBranch({ node, depth }: { node: GeoNode; depth: number }) {
  // Villages and wards render as compact chips; higher levels get a heading
  // plus a nested list, so the tree stays readable rather than deeply indented.
  const isLeafLevel = node.children.length === 0;

  if (depth >= 2 && isLeafLevel) {
    return (
      <li className="inline-flex">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-foreground">
          {node.name}
        </span>
      </li>
    );
  }

  const HeadingTag = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <HeadingTag className="text-lg font-semibold tracking-tight text-foreground">
            {node.name}
          </HeadingTag>
          <Badge variant="primary">{KIND_LABEL[node.kind] ?? node.kind}</Badge>
          {node.aliases.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              also called {node.aliases.join(", ")}
            </span>
          ) : null}
        </div>

        {node.description ? (
          <p className="mb-4 text-sm text-muted-foreground">{node.description}</p>
        ) : null}

        {node.children.length > 0 ? (
          depth >= 1 ? (
            <ul className="flex flex-wrap gap-2">
              {node.children.map((child) => (
                <GeoBranch key={child.id} node={child} depth={depth + 1} />
              ))}
            </ul>
          ) : (
            <div className="space-y-4">
              {node.children.map((child) => (
                <GeoBranch key={child.id} node={child} depth={depth + 1} />
              ))}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
