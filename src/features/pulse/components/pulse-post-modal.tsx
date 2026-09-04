"use client";

import * as React from "react";
import Link from "next/link";
import { X, MessageCircle, Heart, ExternalLink, User } from "lucide-react";

import { VerifiedBadge, type VerificationTier } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface PulsePostModalProps {
  member: {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    verificationType: VerificationTier | null;
    latestPostId: string | null;
  } | null;
  onClose: () => void;
}

export function PulsePostModal({ member, onClose }: PulsePostModalProps) {
  if (!member) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl transition-transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-surface-raised">
          <div className="flex items-center gap-3">
            <div className="relative size-11 overflow-hidden rounded-full border border-border">
              <img
                src={member.avatarUrl}
                alt={member.fullName}
                className="size-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Link
                  href={`/members/${member.username}`}
                  className="hover:underline"
                  onClick={onClose}
                >
                  {member.fullName}
                </Link>
                {member.verificationType ? (
                  <VerifiedBadge type={member.verificationType} />
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">@{member.username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-sunken hover:text-foreground transition-colors"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-border bg-surface-sunken/40 p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span className="font-semibold text-primary">Active Today</span>
              <span>Verified Community Member</span>
            </div>

            <p className="text-sm text-foreground leading-relaxed">
              {member.fullName} is an authenticated verified member who has been active in Igbo-Eze North within the last 24 hours.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <Link
                href={`/members/${member.username}`}
                onClick={onClose}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs")}
              >
                <User className="size-3.5" />
                <span>View Full Profile</span>
              </Link>

            {member.latestPostId && (
              <Link
                  href={`/posts/${member.latestPostId}`}
                  onClick={onClose}
                  className={cn(buttonVariants({ variant: "primary", size: "sm" }), "gap-1.5 text-xs font-medium")}
                >
                  <span>View Post Discussion</span>
                  <ExternalLink className="size-3.5" />
                </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
