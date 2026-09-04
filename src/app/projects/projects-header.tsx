"use client";

import React, { useState } from "react";
import { PlusCircle, Sparkles, HeartHandshake } from "lucide-react";
import { CreateProjectModal } from "@/features/projects/components/create-project-modal";

export function ProjectsHeader() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-2 border border-emerald-200 dark:border-emerald-800">
            <HeartHandshake className="h-3.5 w-3.5 text-emerald-600" />
            <span>Diaspora & Homefront Crowdfunding</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
            Community Projects
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-xl leading-relaxed">
            Collaboratively finance roads, clean water boreholes, solar streetlights, and community facilities across Igbo Eze North. Powered by Paystack.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-800 hover:bg-emerald-700 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition-colors shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Propose Project</span>
        </button>
      </div>

      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </>
  );
}