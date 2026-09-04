"use client";

import React, { useEffect } from "react";
import { SponsoredAdItem } from "@/types/database";
import { VerifiedBadge } from "@/components/ui/badge";
import { Megaphone, ExternalLink, Sparkles } from "lucide-react";
import { recordAdImpressionAction, recordAdClickAction } from "../actions";

interface SponsoredFeedCardProps {
  ad: SponsoredAdItem;
  className?: string;
}

export function SponsoredFeedCard({ ad, className = "" }: SponsoredFeedCardProps) {
  useEffect(() => {
    // Record impression once on mount
    recordAdImpressionAction(ad.id);
  }, [ad.id]);

  const handleClick = () => {
    recordAdClickAction(ad.id);
  };

  return (
    <div
      className={`relative rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/80 via-white to-emerald-50/40 dark:from-amber-950/20 dark:via-zinc-900 dark:to-emerald-950/20 p-5 shadow-sm transition-all hover:shadow-md ${className}`}
    >
      {/* Header Badge */}
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/80 px-3 py-1 text-xs font-semibold text-amber-900 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60 shadow-2xs">
          <Megaphone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>Sponsored Local Business</span>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
          <Sparkles className="h-3 w-3" /> Promoted
        </span>
      </div>

      {/* Advertiser Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-10 w-10 overflow-hidden rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold shadow-2xs">
          {ad.advertiser_avatar ? (
            <img src={ad.advertiser_avatar} alt={ad.advertiser_name} className="h-full w-full object-cover" />
          ) : (
            ad.advertiser_name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              {ad.advertiser_name}
            </span>
            {ad.advertiser_is_verified && ad.advertiser_verification_type && (
              <VerifiedBadge type={ad.advertiser_verification_type} />
            )}
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Ezike Oba Partner</span>
        </div>
      </div>

      {/* Content */}
      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1.5">
        {ad.title}
      </h3>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
        {ad.description}
      </p>

      {/* Image if available */}
      {ad.image_url && (
        <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 max-h-60">
          <img src={ad.image_url} alt={ad.title} className="w-full object-cover" />
        </div>
      )}

      {/* Action Footer */}
      {ad.target_url && (
        <a
          href={ad.target_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm py-2.5 px-4 shadow-sm transition-colors"
        >
          <span>Connect & Learn More</span>
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
