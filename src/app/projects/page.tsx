import React from "react";
import { getCommunityProjects } from "@/features/projects/queries";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectsHeader } from "./projects-header";

export const metadata = {
  title: "Community Projects & Diaspora Crowdfunding | Ezike Oba",
  description: "Fund roads, solar lights, water boreholes, and community infrastructure in Igbo Eze North via Paystack.",
};

// Every other data page carries this; /projects was missing it and was being
// prerendered as static. The totals below are the whole point of the page, and
// a build-time snapshot of them means a donation never moves the progress bar
// until the next deploy -- on the one screen where the number is what persuades
// the next person to give.
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { projects, unavailable } = await getCommunityProjects();

  const totalRaised = projects.reduce((acc, p) => acc + Number(p.raised_amount_naira || 0), 0);
  const totalDonors = projects.reduce((acc, p) => acc + Number(p.donors_count || 0), 0);

  // A failed query must never read as a real zero. "₦0 raised" is a statement
  // about the community; "--" is a statement about this page.
  const naira = (n: number) => (unavailable ? "--" : `₦${n.toLocaleString()}`);
  const count = (n: number) => (unavailable ? "--" : String(n));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <ProjectsHeader />

      {/* Metric Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500 block mb-1">Total Funds Contributed</span>
          <span className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 font-mono">
            {naira(totalRaised)}
          </span>
        </div>

        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500 block mb-1">Active Projects</span>
          <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100">
            {count(projects.length)}
          </span>
        </div>

        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500 block mb-1">Community Contributors</span>
          <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100">
            {count(totalDonors)}
          </span>
        </div>
      </div>

      {/* Projects Grid. Until migration 031 and this page, an empty list was
          filled with three fabricated appeals carrying fabricated raised
          totals, beside a live Contribute button. Nothing is the honest thing
          to show when nobody has raised an appeal. */}
      {unavailable ? (
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Community projects are unavailable right now
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We could not reach the project register. This is a problem on our
            side, not a sign that there are no appeals. Please try again shortly.
          </p>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            No community projects yet
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            When a village union, age grade or community leader raises an appeal
            for a borehole, a road or streetlights, it will appear here for
            neighbours and the diaspora to fund.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}