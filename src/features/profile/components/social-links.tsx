import { Globe, Link2 } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { ProfileSocialLinkRow } from "@/types/database";

/**
 * A member's social links.
 *
 * Every href here is member-supplied, so each carries `noopener noreferrer`
 * (a target="_blank" link otherwise hands the opener a window reference) and
 * `nofollow ugc` (these are user-generated and must not pass ranking signal to
 * whatever someone chooses to link).
 *
 * The scheme is already constrained to http(s) by a CHECK constraint on the
 * table, so a `javascript:` URL cannot be stored in the first place — this is
 * the second layer, not the only one.
 */

const PLATFORM_LABEL: Record<ProfileSocialLinkRow["platform"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  website: "Website",
  other: "Link",
};

export function SocialLinks({
  links,
  className,
}: {
  links: ProfileSocialLinkRow[];
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border",
              "bg-surface px-3 py-1 text-xs font-medium text-foreground",
              "transition-colors hover:border-border-strong hover:text-primary",
            )}
          >
            {link.platform === "website" ? (
              <Globe className="size-3.5" aria-hidden="true" />
            ) : (
              <Link2 className="size-3.5" aria-hidden="true" />
            )}
            {PLATFORM_LABEL[link.platform]}
          </a>
        </li>
      ))}
    </ul>
  );
}
