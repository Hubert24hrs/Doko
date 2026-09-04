import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { BadgeCheck } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-surface-sunken text-muted-foreground border border-border",
        primary: "bg-eo-green-50 text-eo-green-600 border border-eo-green-100",
        accent: "bg-eo-gold-100 text-[color:var(--eo-gold-700)]",
        danger: "bg-danger/10 text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export type VerificationTier = "blue" | "gold";

/**
 * The verification badge.
 *
 * Supports two distinct tiers:
 * - "gold": For office holders, traditional leaders, prominent dignitaries, and patrons.
 * - "blue": For active citizens, regular members, youth, and traders.
 *
 * Supports compact glyph mode (default) or ticker pill mode (showLabel / ticker).
 * Always renders accessible screen-reader text.
 */
export function VerifiedBadge({
  type = "blue",
  label,
  showLabel = false,
  ticker = false,
  className,
}: {
  type?: VerificationTier | null;
  label?: string;
  showLabel?: boolean;
  ticker?: boolean;
  className?: string;
}) {
  const isGold = type === "gold";
  const defaultLabel = isGold ? "Verified Official" : "Verified Member";
  const displayLabel = label ?? defaultLabel;
  const isPill = showLabel || ticker;

  if (isPill) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors shadow-xs",
          isGold
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 ring-1 ring-amber-500/20"
            : "bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/30 ring-1 ring-sky-500/20",
          className,
        )}
        title={displayLabel}
      >
        <BadgeCheck
          className={cn(
            "size-3.5 shrink-0",
            isGold
              ? "text-amber-500 fill-amber-500/20"
              : "text-sky-500 fill-sky-500/20",
          )}
          aria-hidden="true"
        />
        <span className="font-semibold tracking-tight">{displayLabel}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 shrink-0 align-middle",
        isGold
          ? "text-amber-500 hover:text-amber-600 dark:text-amber-400"
          : "text-sky-500 hover:text-sky-600 dark:text-sky-400",
        className,
      )}
      title={displayLabel}
    >
      <BadgeCheck
        className={cn(
          "size-4 shrink-0",
          isGold ? "fill-amber-500/20" : "fill-sky-500/20",
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{displayLabel}</span>
    </span>
  );
}
