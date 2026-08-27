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

/**
 * The verification badge.
 *
 * Always renders accessible text alongside the icon: a verified status that
 * only exists as a coloured glyph is invisible to a screen reader.
 */
export function VerifiedBadge({
  label = "Verified",
  showLabel = false,
  className,
}: {
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-primary", className)}
    >
      <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
      <span className={showLabel ? "text-xs font-medium" : "sr-only"}>
        {label}
      </span>
    </span>
  );
}
