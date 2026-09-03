"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  IGBO_EZE_NORTH_CENTER,
  IGBO_EZE_NORTH_LANDMARKS,
  type MappedIssueItem,
} from "./map-types";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
} from "@/features/issues/schemas";

const STATUS_COLORS: Record<string, string> = {
  reported: "#f59e0b",     // amber
  acknowledged: "#8b5cf6", // purple
  in_progress: "#3b82f6",  // blue
  resolved: "#10b981",     // emerald
  declined: "#6b7280",     // gray
};

const CATEGORY_ICONS: Record<string, string> = {
  water: "💧",
  road: "🚧",
  electricity: "⚡",
  security: "🛡️",
  waste: "🗑️",
  health: "🏥",
  education: "🏫",
  environment: "🌱",
  other: "⚠️",
};

function createMarkerIcon(category: string, status: string): L.DivIcon {
  const color = STATUS_COLORS[status] ?? "#3b82f6";
  const icon = CATEGORY_ICONS[category] ?? "⚠️";

  const html = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      background: #ffffff;
      border: 3px solid ${color};
      border-radius: 50%;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      font-size: 16px;
      cursor: pointer;
      transition: transform 0.15s ease;
    ">
      ${icon}
    </div>
  `;

  return L.divIcon({
    className: "custom-issue-marker",
    html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function createLandmarkIcon(name: string): L.DivIcon {
  const html = `
    <div style="
      background: rgba(15, 23, 42, 0.85);
      color: #ffffff;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 2px 5px rgba(0,0,0,0.25);
      border: 1px solid rgba(255,255,255,0.25);
      pointer-events: none;
    ">
      📍 ${name}
    </div>
  `;

  return L.divIcon({
    className: "custom-landmark-marker",
    html,
    iconSize: [80, 20],
    iconAnchor: [40, 10],
  });
}

export function LeafletMap({
  issues,
  center = IGBO_EZE_NORTH_CENTER,
  zoom = 12,
  showLandmarks = true,
  singleIssueId,
  className = "h-[450px] w-full",
}: {
  issues: MappedIssueItem[];
  center?: [number, number];
  zoom?: number;
  showLandmarks?: boolean;
  singleIssueId?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize map if not already present
    if (!mapInstanceRef.current) {
      const map = L.map(containerRef.current, {
        center,
        zoom,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    // Layer groups for markers so we can clear/re-add when issues change
    const markersLayer = L.layerGroup().addTo(map);

    // Add Community Landmarks
    if (showLandmarks && !singleIssueId) {
      for (const landmark of IGBO_EZE_NORTH_LANDMARKS) {
        L.marker([landmark.latitude, landmark.longitude], {
          icon: createLandmarkIcon(landmark.name),
          interactive: false,
        }).addTo(markersLayer);
      }
    }

    // Add Issue Markers
    const bounds = L.latLngBounds([]);

    for (const issue of issues) {
      if (typeof issue.latitude !== "number" || typeof issue.longitude !== "number") {
        continue;
      }

      const latLng: [number, number] = [issue.latitude, issue.longitude];
      bounds.extend(latLng);

      const marker = L.marker(latLng, {
        icon: createMarkerIcon(issue.category, issue.status),
      });

      const categoryLabel = ISSUE_CATEGORY_LABEL[issue.category] ?? issue.category;
      const statusLabel = ISSUE_STATUS_LABEL[issue.status] ?? issue.status;
      const color = STATUS_COLORS[issue.status] ?? "#3b82f6";
      const locationText = issue.location_text || issue.community?.name || "Igbo-Eze North";

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 200px; max-width: 260px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b;">${categoryLabel}</span>
            <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 9999px; background: ${color}20; color: ${color};">
              ${statusLabel}
            </span>
          </div>
          <h4 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">${issue.title}</h4>
          <p style="font-size: 12px; color: #64748b; margin: 0 0 8px 0;">📍 ${locationText}</p>
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px;">
            <span style="color: #64748b;">👁️ ${issue.confirm_count} confirmed</span>
            <a href="/issues/${issue.id}" style="color: #059669; font-weight: 600; text-decoration: underline;">View details &rarr;</a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.addTo(markersLayer);

      if (singleIssueId && issue.id === singleIssueId) {
        marker.openPopup();
      }
    }

    if (issues.length > 1 && bounds.isValid() && !singleIssueId) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    } else if (issues.length === 1 && bounds.isValid()) {
      map.setView([issues[0].latitude, issues[0].longitude], 15);
    }

    return () => {
      markersLayer.clearLayers();
    };
  }, [issues, center, zoom, showLandmarks, singleIssueId]);

  // Clean up map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border shadow-sm">
      <div ref={containerRef} className={className} />
    </div>
  );
}
