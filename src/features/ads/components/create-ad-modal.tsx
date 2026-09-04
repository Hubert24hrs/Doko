"use client";

import React, { useState, useTransition } from "react";
import { Megaphone, X, CheckCircle, AlertCircle, Loader2, CreditCard } from "lucide-react";
import { createAdCampaignAction } from "../actions";
import { initializeAdPaymentAction } from "@/features/payments/actions";

interface CreateAdModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateAdModal({ isOpen, onClose }: CreateAdModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [payWithPaystack, setPayWithPaystack] = useState(true);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData(e.currentTarget);
    const budget = Number(formData.get("budget_naira")) || 5000;

    startTransition(async () => {
      const res = await createAdCampaignAction(null, formData);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to submit advertisement campaign.");
        return;
      }

      if (payWithPaystack && res.adId && budget > 0) {
        setSuccessMsg("Campaign created! Initializing secure Paystack checkout...");
        const pmt = await initializeAdPaymentAction(res.adId, budget);
        if (pmt.success && pmt.authorization_url) {
          window.location.href = pmt.authorization_url;
          return;
        }
      }

      setSuccessMsg(res.message || "Campaign submitted successfully!");
      setTimeout(() => {
        onClose();
      }, 2000);
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Campaign Budget (₦) *
              </label>
              <input
                name="budget_naira"
                type="number"
                min={100}
                step={500}
                defaultValue={5000}
                required
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[11px] text-zinc-500 mt-0.5 block">Recommended: ₦5,000 - ₦25,000</span>
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

          <div className="rounded-xl p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
            <input
              type="checkbox"
              id="payWithPaystack"
              checked={payWithPaystack}
              onChange={(e) => setPayWithPaystack(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300"
            />
            <label htmlFor="payWithPaystack" className="text-xs cursor-pointer">
              <span className="font-semibold text-emerald-950 dark:text-emerald-200 block">
                Fund Campaign Budget via Paystack (Card, Transfer, USSD)
              </span>
              <span className="text-zinc-600 dark:text-zinc-400 block mt-0.5">
                Fund your campaign budget securely now to expedite administrative approval and instant activation.
              </span>
            </label>
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
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : payWithPaystack ? (
                <>
                  <CreditCard className="h-4 w-4" />
                  <span>Proceed to Paystack</span>
                </>
              ) : (
                <span>Submit Ad Campaign</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}