import { cn } from "@/lib/utils/cn";

/**
 * The Ezike Oba mark.
 *
 * A stylised nsibidi-inspired convergence: four paths meeting at a centre,
 * for the districts and towns meeting in one place. Drawn as inline SVG so it
 * inherits `currentColor` and needs no network request.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-8", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="16"
        cy="16"
        r="14.5"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.35"
      />
      <path
        d="M16 4.5v8M16 19.5v8M4.5 16h8M19.5 16h8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="4" fill="currentColor" />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-7 text-primary" />
      {showWordmark ? (
        <span className="text-lg font-bold tracking-tight text-foreground">
          Ezike<span className="text-primary">Oba</span>
        </span>
      ) : null}
      <span className="sr-only">Ezike Oba</span>
    </span>
  );
}
