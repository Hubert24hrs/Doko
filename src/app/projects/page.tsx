import React from "react";
import { getCommunityProjects } from "@/features/projects/queries";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectsHeader } from "./projects-header";

export const metadata = {
  title: "Community Projects & Diaspora Crowdfunding | Ezike Oba",
  description: "Fund roads, solar lights, water boreholes, and community infrastructure in Igbo Eze North via Paystack.",
};

export default async function ProjectsPage() {
  const projects = await getCommunityProjects();

  const totalRaised = projects.reduce((acc, p) => acc + Number(p.raised_amount_naira || 0), 0);
  const totalDonors = projects.reduce((acc, p) => acc + Number(p.donors_count || 0), 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <ProjectsHeader />

      {/* Metric Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500 block mb-1">Total Funds Contributed</span>
          <span className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 font-mono">
            ₦{totalRaised.toLocaleString()}
          </span>
        </div>

        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500 block mb-1">Active Projects</span>
          <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100">
            {projects.length}
          </span>
        </div>

        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500 block mb-1">Community Contributors</span>
          <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100">
            {totalDonors}
          </span>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}