"use client";

import React, { useState, useTransition } from "react";
import { X, Heart, ShieldCheck, Loader2, CreditCard, CheckCircle2 } from "lucide-react";
import { ProjectListItem } from "../queries";
import { donateToProjectAction } from "../actions";

interface DonateModalProps {
  project: ProjectListItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [1000, 5000, 20000, 50000];

export function DonateModal({ project, isOpen, onClose }: DonateModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(5000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [donorName, setDonorName] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !project) return null;

  const finalAmount = customAmount ? Number(customAmount) : selectedAmount;

  const handleDonate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalAmount || finalAmount < 500) {
      setErrorMsg("Minimum contribution amount is ₦500");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg("Preparing secure Paystack checkout...");

    startTransition(async () => {
      const res = await donateToProjectAction(project.id, finalAmount, donorName);
      if (res.success && res.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        setErrorMsg(res.error || "Failed to initialize payment checkout.");
        setSuccessMsg(null);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-2 text-emerald-800 dark:text-emerald-400">
          <Heart className="h-5 w-5 text-rose-500 fill-rose-500" />
          <h3 className="text-lg font-bold">Support Civic Project</h3>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4 line-clamp-2">
          {project.title}
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/50 p-3 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 p-3 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleDonate} className="space-y-4">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Select Contribution Amount
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => {
                    setSelectedAmount(amt);
                    setCustomAmount("");
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    !customAmount && selectedAmount === amt
                      ? "bg-emerald-800 text-white shadow-md"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  ₦{amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Or Custom Amount (₦)
            </label>
            <input
              type="number"
              min={500}
              step={500}
              placeholder="e.g. 15000"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
              }}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Donor Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Donor Name / Recognition (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Chief Emeka or Anonymous"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-1">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Secured with 256-bit encryption by Paystack (Card, Transfer, USSD).</span>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Contribute ₦{finalAmount ? finalAmount.toLocaleString() : "0"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}