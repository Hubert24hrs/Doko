"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { FieldInput } from "./field";

/**
 * Password input with a show/hide toggle.
 *
 * Accessibility details that matter here:
 *
 * - `type="button"` so the toggle never submits the form.
 * - The accessible name states the ACTION ("Show password") and `aria-pressed`
 *   carries the state, which is how a screen reader announces a toggle.
 * - Revealing sets `type="text"`, which browsers exclude from autofill
 *   heuristics; `autoComplete` is passed through by the caller so password
 *   managers still behave.
 * - The toggle sits outside the input's padding box, so long passwords never
 *   render underneath it.
 */
export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordField({ className, ...props }, ref) {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="relative">
      <FieldInput
        ref={ref}
        type={revealed ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-pressed={revealed}
        aria-label={revealed ? "Hide password" : "Show password"}
        title={revealed ? "Hide password" : "Show password"}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2",
          "inline-flex size-8 items-center justify-center rounded-md",
          "text-muted-foreground transition-colors",
          "hover:bg-surface-sunken hover:text-foreground",
        )}
      >
        {revealed ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
