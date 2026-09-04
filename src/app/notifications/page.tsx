import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/features/auth/session";
import {
  getNotifications,
  getUnreadNotificationCount,
} from "@/features/notifications/queries";
import { markAllNotificationsReadAction } from "@/features/notifications/actions";
import { NotificationList } from "@/features/notifications/components/notification-list";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  await requireUser("/notifications");
  const { after } = await searchParams;

  const [page, unreadCount] = await Promise.all([
    getNotifications(after),
    getUnreadNotificationCount(),
  ]);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/feed"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Feed
            </Link>
            <Link
              href="/issues"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-sunken"
            >
              Issues
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Notifications
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {unreadCount !== null && unreadCount > 0
                ? `You have ${unreadCount} unread ${unreadCount === 1 ? "alert" : "alerts"}.`
                : "Activity and updates from your communities."}
            </p>
          </div>

          {unreadCount !== null && unreadCount > 0 ? (
            <form action={async () => {
              "use server";
              await markAllNotificationsReadAction();
            }}>
              <button
                type="submit"
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            </form>
          ) : null}
        </div>

        <section aria-label="Notifications" className="mt-6">
          {!page.available ? (
            <ErrorState
              title="Notifications could not be loaded"
              description="This is usually a temporary connection issue. Please try again shortly."
            />
          ) : page.notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="size-6" />}
              title="No notifications yet"
              description="When neighbours confirm issues you reported, comment on your posts, or community leaders post updates, you will see them here."
            />
          ) : (
            <NotificationList notifications={page.notifications} />
          )}

          {page.nextCursor ? (
            <div className="mt-6 flex justify-center">
              <Link
                href={`/notifications?after=${encodeURIComponent(page.nextCursor)}`}
                className="inline-flex h-9 items-center rounded-lg border border-border-strong px-4 text-xs font-medium text-foreground transition-colors hover:bg-surface-sunken"
              >
                Show older notifications
              </Link>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
