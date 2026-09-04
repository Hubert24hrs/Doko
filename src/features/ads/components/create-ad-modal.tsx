"use client";

import React, { useState, useTransition } from "react";
import { Megaphone, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { createAdCampaignAction } from "../actions";

interface CreateAdModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateAdModal({ isOpen, onClose }: CreateAdModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAdCampaignAction(null, formData);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to submit advertisement campaign.");
      } else {
        setSuccessMsg(res.message || "Campaign submitted successfully!");
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-4 text-emerald-800 dark:text-emerald-400">
          <Megaphone className="h-6 w-6" />
          <h2 className="text-xl font-bold">Promote Your Business</h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
          Showcase your local business, products, or service to thousands of members across Igbo Eze North.
        </p>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/50 p-3 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 p-3 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Business / Campaign Title *
            </label>
            <input
              name="title"
              required
              placeholder="e.g. Umuogbo Agu Organic Honey & Farming"
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Promotion Description *
            </label>
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Describe your goods, service, location in Igbo Eze North, or special offer..."
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target URL / WhatsApp Link
              </label>
              <input
                name="target_url"
                type="url"
                placeholder="https://wa.me/234..."
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Banner / Photo Image URL
              </label>
              <input
                name="image_url"
                type="url"
                placeholder="https://..."
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Ad Placement
              </label>
              <select
                name="placement"
                defaultValue="feed_sponsored"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              >
                <option value="feed_sponsored">Community Feed Sponsored Card</option>
                <option value="marketplace_banner">Marketplace Top Banner</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Duration (Days)
              </label>
              <input
                name="duration_days"
                type="number"
                min={1}
                max={90}
                defaultValue={30}
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Submit Ad Campaign</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
