"use client";

import { useState, useMemo } from "react";
import { Layers, MapPin, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeafletMap } from "./leaflet-map";
import {
  type MappedIssueItem,
  IGBO_EZE_NORTH_CENTER,
  DEFAULT_MAP_ZOOM,
} from "./map-types";
import {
  issueCategories,
  ISSUE_CATEGORY_LABEL,
  issueStatuses,
  ISSUE_STATUS_LABEL,
} from "@/features/issues/schemas";

export function IssuesMap({
  issues,
  className = "h-[520px] w-full",
}: {
  issues: MappedIssueItem[];
  className?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (selectedCategory !== "all" && issue.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus !== "all" && issue.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [issues, selectedCategory, selectedStatus]);

  function handleReset() {
    setSelectedCategory("all");
    setSelectedStatus("all");
  }

  return (
    <div className="space-y-3">
      {/* Controls & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Layers className="size-3.5" aria-hidden="true" />
            Filters:
          </span>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter by category"
            className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground"
          >
            <option value="all">All Categories ({issues.length})</option>
            {issueCategories.map((c) => {
              const count = issues.filter((i) => i.category === c).length;
              return (
                <option key={c} value={c}>
                  {ISSUE_CATEGORY_LABEL[c]} ({count})
                </option>
              );
            })}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            aria-label="Filter by status"
            className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground"
          >
            <option value="all">All Statuses</option>
            {issueStatuses.map((s) => {
              const count = issues.filter((i) => i.status === s).length;
              return (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABEL[s]} ({count})
                </option>
              );
            })}
          </select>

          {(selectedCategory !== "all" || selectedStatus !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 px-2 text-xs"
            >
              <RefreshCw className="size-3 mr-1" aria-hidden="true" />
              Reset
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="neutral">
            {filteredIssues.length} of {issues.length} pinned issues
          </Badge>
        </div>
      </div>

      {/* Map */}
      <LeafletMap
        issues={filteredIssues}
        center={IGBO_EZE_NORTH_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        showLandmarks={true}
        className={className}
      />

      {/* Map Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken/60 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="size-3.5 text-primary" aria-hidden="true" />
          <span>Igbo-Eze North LGA, Enugu State</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" />
            Reported
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" />
            In Progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            Fixed / Resolved
          </span>
        </div>
      </div>
    </div>
  );
}
