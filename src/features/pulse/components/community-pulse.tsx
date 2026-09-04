"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, Activity, ShieldCheck, Users } from "lucide-react";

import SphereImageGrid, { type ImageData } from "@/components/ui/img-sphere";
import { VerifiedBadge, type VerificationTier } from "@/components/ui/badge";
import { PulsePostModal } from "./pulse-post-modal";
import type { PulseMemberData } from "../queries";

interface CommunityPulseProps {
  initialMembers?: PulseMemberData[];
  className?: string;
}

export function CommunityPulse({
  initialMembers = [],
  className = "",
}: CommunityPulseProps) {
  const [selectedMember, setSelectedMember] = React.useState<{
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    verificationType: VerificationTier | null;
    latestPostId: string | null;
  } | null>(null);

  const activeCount = initialMembers.length;

  const sphereImages: ImageData[] = initialMembers.map((m) => ({
    id: m.id,
    src: m.src,
    alt: m.alt,
    title: m.fullName,
    description: `@${m.username}`,
    verificationType: m.verificationType,
    username: m.username,
    fullName: m.fullName,
    latestPostId: m.latestPostId,
  }));

  const handleImageClick = (img: ImageData) => {
    setSelectedMember({
      userId: img.id,
      username: img.username ?? img.description?.replace("@", "") ?? "member",
      fullName: img.fullName ?? img.title ?? "Verified Member",
      avatarUrl: img.src,
      verificationType: img.verificationType ?? null,
      latestPostId: img.latestPostId ?? null,
    });
  };

  return (
    <section
      aria-label="Community Pulse Active Today"
      className={`relative overflow-hidden rounded-2xl border border-eo-gold-500/30 bg-gradient-to-br from-eo-gold-100/30 via-surface to-surface-sunken p-6 shadow-sm dark:from-eo-gold-950/20 ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30">
            <Activity className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                Community Pulse
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-400/30">
                <Sparkles className="size-3" />
                <span>Active Today</span>
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Verified members active in Igbo-Eze North within the last 24 hours.
            </p>
          </div>
        </div>

        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground border border-border shadow-2xs">
            <Users className="size-3.5 text-primary" />
            <span>{activeCount} verified active</span>
          </div>
        )}
      </div>

      {/* Sphere Container / Display */}
      <div className="mt-6 flex justify-center items-center">
        {activeCount >= 4 ? (
          <div className="relative flex justify-center w-full max-w-xl">
            <SphereImageGrid
              images={sphereImages}
              containerSize={480}
              sphereRadius={180}
              dragSensitivity={0.8}
              momentumDecay={0.96}
              maxRotationSpeed={6}
              baseImageScale={0.16}
              hoverScale={1.3}
              perspective={1000}
              autoRotate={true}
              autoRotateSpeed={0.25}
              onImageClick={handleImageClick}
            />
          </div>
        ) : activeCount > 0 ? (
          <div className="py-6 flex flex-wrap justify-center items-center gap-6">
            {initialMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  handleImageClick({
                    id: m.id,
                    src: m.src,
                    alt: m.alt,
                    title: m.fullName,
                    description: `@${m.username}`,
                    verificationType: m.verificationType,
                    username: m.username,
                    fullName: m.fullName,
                    latestPostId: m.latestPostId,
                  })
                }
                className="group relative flex flex-col items-center transition-transform hover:scale-105"
              >
                <div className="relative size-16 overflow-hidden rounded-full border-2 border-surface shadow-md">
                  <img src={m.src} alt={m.alt} className="size-full object-cover" />
                </div>
                {m.verificationType ? (
                  <div className="absolute bottom-5 right-0 rounded-full bg-surface shadow-xs p-0.5">
                    <VerifiedBadge type={m.verificationType} />
                  </div>
                ) : null}
                <span className="mt-2 text-xs font-semibold text-foreground group-hover:underline">
                  {m.fullName}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center max-w-sm mx-auto">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-sunken text-muted-foreground border border-border">
              <ShieldCheck className="size-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">
              No verified activity in the last 24 hours
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verified members who create posts, comments, or reactions automatically appear in the Community Pulse.
            </p>
            <div className="mt-4">
              <Link
                href="/verification"
                className="text-xs font-medium text-primary hover:underline"
              >
                Get verified to join the pulse &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Post Modal */}
      <PulsePostModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </section>
  );
}
