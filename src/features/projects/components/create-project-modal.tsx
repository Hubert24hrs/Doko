"use client";

import React, { useState, useTransition } from "react";
import { X, Hammer, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { createProjectAction } from "../actions";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
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
      const res = await createProjectAction(null, formData);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to submit project proposal.");
      } else {
        setSuccessMsg(res.message || "Project proposal submitted successfully!");
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-900 p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-2 text-emerald-800 dark:text-emerald-400">
          <Hammer className="h-6 w-6" />
          <h2 className="text-xl font-bold">Propose Community Project</h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
          Propose a civic infrastructure development initiative in Igbo Eze North for community and diaspora crowdfunding.
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
              Project Title *
            </label>
            <input
              name="title"
              required
              placeholder="e.g. Amufie Market Solar Streetlights Project"
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Detailed Description *
            </label>
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Explain the scope of the project, target village, estimated completion timeline, and anticipated community benefits..."
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Project Category
              </label>
              <select
                name="category"
                defaultValue="road"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              >
                <option value="road">Roads & Grading</option>
                <option value="water_borehole">Clean Water & Borehole</option>
                <option value="electricity_solar">Solar & Power</option>
                <option value="school_education">School Renovation</option>
                <option value="health_center">Health Center Upgrade</option>
                <option value="security">Community Security</option>
                <option value="culture">Cultural Heritage</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target Funding Goal (₦) *
              </label>
              <input
                name="target_amount_naira"
                type="number"
                min={10000}
                step={10000}
                defaultValue={500000}
                required
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Banner / Site Photo URL (Optional)
            </label>
            <input
              name="image_url"
              type="url"
              placeholder="https://..."
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
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
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Submit for Verification</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}