import React from "react";
import { requireStaff } from "@/features/auth/session";
import { getPendingAdCampaigns } from "@/features/ads/queries";
import { AdModerationControls } from "./ad-moderation-controls";
import { Megaphone, CheckCircle2, XCircle, Clock, BarChart3 } from "lucide-react";

export const metadata = {
  title: "Ad Moderation Console | Ezike Oba Admin",
};

export default async function AdminAdsPage() {
  await requireStaff();
  const campaigns = await getPendingAdCampaigns();

  const pendingAds = campaigns.filter((c) => c.status === "pending");
  const activeAds = campaigns.filter((c) => c.status === "active" || c.status === "approved");

  return (
    <main className="container max-w-5xl py-8 px-4 sm:px-6">
      <div className="mb-8 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Megaphone className="h-6 w-6" />
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Ad Moderation Console
            </h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Review, approve, or reject sponsored local business promotions across Ezike Oba.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-5">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold mb-1">
            <Clock className="h-4 w-4" />
            <span>Pending Review</span>
          </div>
          <span className="text-3xl font-extrabold text-amber-900 dark:text-amber-200">
            {pendingAds.length}
          </span>
        </div>

        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-5">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span>Active Ads</span>
          </div>
          <span className="text-3xl font-extrabold text-emerald-900 dark:text-emerald-200">
            {activeAds.length}
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
            <BarChart3 className="h-4 w-4" />
            <span>Total Submissions</span>
          </div>
          <span className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">
            {campaigns.length}
          </span>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">All Submitted Campaigns</h2>

        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center">
            <Megaphone className="mx-auto h-10 w-10 text-zinc-400 mb-3" />
            <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No ad campaigns submitted yet</h3>
            <p className="text-xs text-zinc-500 mt-1">Submitted ad campaigns will appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((ad) => (
              <div
                key={ad.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <div>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider mb-1 ${
                        ad.status === "active"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : ad.status === "pending"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {ad.status}
                    </span>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{ad.title}</h3>
                    <p className="text-xs text-zinc-500">By {ad.advertiser_name} • Placement: {ad.placement}</p>
                  </div>

                  <AdModerationControls adId={ad.id} currentStatus={ad.status} />
                </div>

                <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">{ad.description}</p>

                <div className="flex flex-wrap gap-4 text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
                  <span>Impressions: <strong>{ad.impressions_count}</strong></span>
                  <span>Clicks: <strong>{ad.clicks_count}</strong></span>
                  <span>Target URL: <a href={ad.target_url || "#"} target="_blank" className="text-emerald-600 underline">{ad.target_url || "None"}</a></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
