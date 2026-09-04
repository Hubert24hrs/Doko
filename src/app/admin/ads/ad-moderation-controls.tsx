"use client";

import React, { useState, useTransition } from "react";
import { moderateAdCampaignAction } from "@/features/ads/actions";
import { AdStatus } from "@/types/database";
import { Check, X, Pause, Play, Loader2 } from "lucide-react";

interface AdModerationControlsProps {
  adId: string;
  currentStatus: AdStatus;
}

export function AdModerationControls({ adId, currentStatus }: AdModerationControlsProps) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: AdStatus) => {
    startTransition(async () => {
      await moderateAdCampaignAction(adId, newStatus);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}

      {currentStatus === "pending" && (
        <>
          <button
            onClick={() => handleStatusChange("active")}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 shadow-2xs transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Approve & Launch</span>
          </button>

          <button
            onClick={() => handleStatusChange("rejected")}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold px-3 py-1.5 shadow-2xs transition-colors disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            <span>Reject</span>
          </button>
        </>
      )}

      {currentStatus === "active" && (
        <button
          onClick={() => handleStatusChange("paused")}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Pause className="h-3.5 w-3.5" />
          <span>Pause</span>
        </button>
      )}

      {currentStatus === "paused" && (
        <button
          onClick={() => handleStatusChange("active")}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5"
        >
          <Play className="h-3.5 w-3.5" />
          <span>Resume</span>
        </button>
      )}
    </div>
  );
}
