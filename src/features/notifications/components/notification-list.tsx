"use client";

import Link from "next/link";
import {
  AlertCircle,
  Bell,
  CheckCheck,
  Eye,
  Heart,
  MessageSquare,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { NotificationItem } from "../queries";
import { markNotificationReadAction } from "../actions";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  issue_confirmed: <Eye className="size-4 text-amber-600" aria-hidden="true" />,
  issue_status: <AlertCircle className="size-4 text-blue-600" aria-hidden="true" />,
  comment: <MessageSquare className="size-4 text-emerald-600" aria-hidden="true" />,
  reaction: <Heart className="size-4 text-rose-600" aria-hidden="true" />,
  follow: <UserPlus className="size-4 text-purple-600" aria-hidden="true" />,
  message: <MessageSquare className="size-4 text-primary" aria-hidden="true" />,
  system: <ShieldCheck className="size-4 text-foreground" aria-hidden="true" />,
};

export function NotificationList({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  return (
    <ul className="space-y-2.5">
      {notifications.map((item) => {
        const isUnread = !item.read_at;
        const icon = TYPE_ICONS[item.type] ?? <Bell className="size-4" aria-hidden="true" />;

        return (
          <li key={item.id}>
            <Card
              className={cn(
                "transition-colors",
                isUnread
                  ? "border-primary/40 bg-surface-sunken/40"
                  : "border-border bg-surface",
              )}
            >
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full border border-border bg-surface p-2 shadow-xs">
                    {icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {item.title}
                      </h3>
                      {isUnread ? (
                        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                      ) : null}
                    </div>

                    {item.body ? (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.body}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                      <time dateTime={item.created_at}>
                        {new Date(item.created_at).toLocaleString("en-NG", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>

                      {item.link ? (
                        <Link
                          href={item.link}
                          className="font-medium text-primary hover:underline"
                        >
                          View &rarr;
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>

                {isUnread ? (
                  <form action={async (formData) => { await markNotificationReadAction({ ok: false }, formData); }}>
                    <input type="hidden" name="notificationId" value={item.id} />
                    <button
                      type="submit"
                      title="Mark as read"
                      aria-label="Mark as read"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
                    >
                      <CheckCheck className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
