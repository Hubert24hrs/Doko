import Link from "next/link";
import { Bell } from "lucide-react";

import { getUnreadNotificationCount } from "../queries";

export async function NotificationsNavLink({ className }: { className?: string }) {
  const unread = await getUnreadNotificationCount();

  return (
    <Link
      href="/notifications"
      aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      className={
        className ??
        "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
      }
    >
      <Bell className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Alerts</span>
      {unread !== null && unread > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
          {unread > 99 ? "99+" : unread}
          <span className="sr-only"> unread notifications</span>
        </span>
      ) : null}
    </Link>
  );
}
