import Link from "next/link";

import { getUnreadCount } from "../queries";

/**
 * "Messages" in the header, with an unread badge.
 *
 * A failed count renders NO badge rather than a zero. A zero is a claim that
 * there is nothing waiting, and a broken query must never be able to make it.
 */
export async function MessagesNavLink({ className }: { className?: string }) {
  const unread = await getUnreadCount();

  return (
    <Link
      href="/messages"
      className={
        className ??
        "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
      }
    >
      Messages
      {unread !== null && unread > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
          {unread > 99 ? "99+" : unread}
          <span className="sr-only"> unread messages</span>
        </span>
      ) : null}
    </Link>
  );
}
