"use client";

import React, { useState } from "react";
import { ProjectListItem } from "../queries";
import { DonateModal } from "./donate-modal";
import { MapPin, Users, Heart, Sparkles, CheckCircle } from "lucide-react";

interface ProjectCardProps {
  project: ProjectListItem;
}

const CATEGORY_LABELS: Record<string, string> = {
  road: "Roads & Grading",
  water_borehole: "Water & Boreholes",
  electricity_solar: "Solar & Power",
  school_education: "Schools & Education",
  health_center: "Healthcare & Clinics",
  security: "Community Security",
  culture: "Culture & Heritage",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const [isDonateOpen, setIsDonateOpen] = useState(false);

  const targetFormatted = Number(project.target_amount_naira).toLocaleString();
  const raisedFormatted = Number(project.raised_amount_naira).toLocaleString();
  const isCompleted = project.percentage_funded >= 100 || project.status === "completed";

  return (
    <>
      <div className="flex flex-col rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-md overflow-hidden hover:shadow-xl transition-all duration-300">
        {/* Banner Image */}
        <div className="relative h-48 w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          {project.image_url ? (
            <img
              src={project.image_url}
              alt={project.title}
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-emerald-900 to-emerald-950 text-emerald-300">
              <Sparkles className="h-10 w-10 opacity-40" />
            </div>
          )}

          <div className="absolute top-3 left-3 flex gap-2">
            <span className="rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-bold text-white border border-white/20">
              {CATEGORY_LABELS[project.category] || "Civic Project"}
            </span>
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-white">
            <MapPin className="h-3 w-3 text-amber-400" />
            <span>{project.village_name || "Igbo Eze North"}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2 leading-snug">
              {project.title}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed mb-4">
              {project.description}
            </p>
          </div>

          <div>
            {/* Funding Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-baseline text-xs mb-1.5 font-semibold">
                <span className="text-emerald-800 dark:text-emerald-400 font-mono text-sm">
                  ₦{raisedFormatted}
                </span>
                <span className="text-zinc-500 text-[11px]">
                  Goal: ₦{targetFormatted} ({project.percentage_funded}%)
                </span>
              </div>

              <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, project.percentage_funded)}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-zinc-500 mt-2">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{project.donors_count} Supporters</span>
                </div>
                {isCompleted ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Funded!
                  </span>
                ) : (
                  <span>Organized by {project.creator_name}</span>
                )}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => setIsDonateOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-800 hover:bg-emerald-700 py-3 px-4 text-xs font-bold text-white shadow-md transition-colors"
            >
              <Heart className="h-3.5 w-3.5 text-rose-300 fill-rose-300" />
              <span>{isCompleted ? "Contribute More" : "Contribute via Paystack"}</span>
            </button>
          </div>
        </div>
      </div>

      <DonateModal
        project={project}
        isOpen={isDonateOpen}
        onClose={() => setIsDonateOpen(false)}
      />
    </>
  );
}