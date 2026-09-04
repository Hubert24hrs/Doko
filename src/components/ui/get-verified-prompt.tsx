"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, ShieldCheck, X, Sparkles, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";

interface GetVerifiedPromptProps {
  variant?: "banner" | "card" | "modal";
  className?: string;
  isVerified?: boolean;
}

export function GetVerifiedPrompt({
  variant = "banner",
  className,
  isVerified = false,
}: GetVerifiedPromptProps) {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    // If already verified, do not display
    if (isVerified) return;

    // Check if dismissed in this session
    try {
      const isDismissed = sessionStorage.getItem("eo_get_verified_dismissed");
      if (!isDismissed) {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, [isVerified]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("eo_get_verified_dismissed", "true");
    } catch {
      // ignore storage failure
    }
  };

  if (isVerified || (variant !== "card" && dismissed)) {
    return null;
  }

  if (variant === "card") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-eo-gold-500/30 bg-gradient-to-br from-eo-gold-100/60 via-surface to-surface-sunken p-5 shadow-xs dark:from-eo-gold-700/10 dark:via-surface dark:to-surface-sunken",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Get Verified on Ezike Oba
              </h3>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                Official
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Earn community trust with official badges:{" "}
              <strong className="text-amber-600 dark:text-amber-400">Golden</strong> for office holders & prominent leaders, and{" "}
              <strong className="text-sky-600 dark:text-sky-400">Blue</strong> for active members.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/verification"
                className={cn(
                  buttonVariants({ variant: "primary", size: "sm" }),
                  "gap-1.5 text-xs font-semibold shadow-xs"
                )}
              >
                <span>Get Verified</span>
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="/verification"
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                Learn more
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Floating banner / prompt for unverified registered users
  return (
    <aside
      aria-label="Verification reminder"
      className={cn(
        "relative mb-4 overflow-hidden rounded-xl border border-eo-gold-500/40 bg-surface-raised/95 p-4 shadow-md backdrop-blur-md dark:border-eo-gold-700/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-sky-500 p-0.5 text-white shadow-xs">
            <div className="flex size-full items-center justify-center rounded-full bg-surface">
              <BadgeCheck className="size-5 text-amber-500" />
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                Get Verified on Ezike Oba
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Golden & Blue Tiers
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground max-w-xl leading-relaxed">
              Verify your profile to unlock verified tickers, authenticate your community standing, and access leadership features.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Link
                href="/verification"
                className={cn(
                  buttonVariants({ variant: "primary", size: "sm" }),
                  "h-8 rounded-lg px-3 text-xs font-semibold gap-1.5 shadow-xs"
                )}
              >
                <ShieldCheck className="size-3.5" />
                <span>Get Verified</span>
              </Link>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Dismiss for now
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-1 text-muted-foreground hover:bg-surface-sunken hover:text-foreground transition-colors"
          aria-label="Close verification prompt"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
