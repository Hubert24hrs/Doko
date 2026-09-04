"use client";

import React, { useEffect } from "react";
import { SponsoredAdItem } from "@/types/database";
import { VerifiedBadge } from "@/components/ui/badge";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { recordAdImpressionAction, recordAdClickAction } from "../actions";

interface MarketplaceBannerAdProps {
  ad: SponsoredAdItem;
  className?: string;
}

export function MarketplaceBannerAd({ ad, className = "" }: MarketplaceBannerAdProps) {
  useEffect(() => {
    recordAdImpressionAction(ad.id);
  }, [ad.id]);

  const handleClick = () => {
    recordAdClickAction(ad.id);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-950 text-white p-6 shadow-md ${className}`}
    >
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="max-w-xl">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-700/80 px-3 py-0.5 text-xs font-semibold text-emerald-100 backdrop-blur-sm border border-emerald-500/30">
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Featured Marketplace Partner</span>
          </div>

          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-xl font-extrabold tracking-tight text-white">{ad.title}</h3>
            {ad.advertiser_is_verified && ad.advertiser_verification_type && (
              <VerifiedBadge type={ad.advertiser_verification_type} />
            )}
          </div>

          <p className="text-sm text-emerald-100/90 leading-relaxed">
            {ad.description}
          </p>
        </div>

        {ad.target_url && (
          <a
            href={ad.target_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm px-5 py-3 shadow-md transition-all transform hover:-translate-y-0.5"
          >
            <span>Explore Offers</span>
            <ArrowRight className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Decorative background glow */}
      <div className="absolute -right-12 -bottom-12 h-48 w-48 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />
    </div>
  );
}
