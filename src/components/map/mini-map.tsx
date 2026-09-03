"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { LeafletMap } from "./leaflet-map";
import type { MappedIssueItem } from "./map-types";

export function MiniMap({
  issue,
  className = "h-[220px] w-full",
}: {
  issue: MappedIssueItem;
  className?: string;
}) {
  if (typeof issue.latitude !== "number" || typeof issue.longitude !== "number") {
    return null;
  }

  const googleMapsUrl = `https://www.google.com/maps?q=${issue.latitude},${issue.longitude}`;

  return (
    <div className="space-y-2">
      <LeafletMap
        issues={[issue]}
        center={[issue.latitude, issue.longitude]}
        zoom={15}
        showLandmarks={false}
        singleIssueId={issue.id}
        className={className}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3 text-primary" aria-hidden="true" />
          {issue.latitude.toFixed(5)}, {issue.longitude.toFixed(5)}
        </span>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Open in Google Maps
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
