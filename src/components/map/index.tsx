"use client";

import dynamic from "next/dynamic";

export * from "./map-types";

export const IssuesMap = dynamic(
  () => import("./issues-map").then((mod) => mod.IssuesMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] w-full flex-col items-center justify-center rounded-xl border border-border bg-surface-sunken/50 p-6 text-muted-foreground">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-sm font-medium">Loading Igbo Eze North Map...</p>
      </div>
    ),
  },
);

export const MiniMap = dynamic(
  () => import("./mini-map").then((mod) => mod.MiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] w-full items-center justify-center rounded-xl border border-border bg-surface-sunken/50 text-muted-foreground">
        <p className="text-xs">Loading map pin...</p>
      </div>
    ),
  },
);
