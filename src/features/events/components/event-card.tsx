import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

import { EVENT_KIND_LABEL } from "../schemas";
import {
  countdownLabel,
  eventShortDay,
  eventTime,
  isHappeningNow,
} from "../format";
import type { EventSummary } from "../queries";

export function EventCard({
  event,
  className,
}: {
  event: EventSummary;
  className?: string;
}) {
  const cancelled = event.cancelled_at !== null;
  const now = !cancelled && isHappeningNow(event.starts_at, event.ends_at);
  const countdown = cancelled ? null : countdownLabel(event.starts_at);

  return (
    <Card className={className}>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            href={`/events/${event.id}`}
            className={cn(
              "font-medium text-foreground hover:underline",
              cancelled && "line-through decoration-danger/60",
            )}
          >
            {event.title}
          </Link>

          <div className="flex flex-wrap items-center gap-1.5">
            {cancelled ? (
              <Badge variant="neutral">Cancelled</Badge>
            ) : now ? (
              <Badge>Happening now</Badge>
            ) : countdown ? (
              <Badge variant="neutral">{countdown}</Badge>
            ) : null}
            <Badge variant="neutral">{EVENT_KIND_LABEL[event.kind]}</Badge>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden="true" />
            <time dateTime={event.starts_at}>
              {eventShortDay(event.starts_at)}
              {event.is_all_day ? "" : `, ${eventTime(event.starts_at)}`}
            </time>
          </span>

          {event.venue ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {event.venue}
              {event.community ? ` · ${event.community.name}` : ""}
            </span>
          ) : event.community ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {event.community.name}
            </span>
          ) : null}
        </div>

        {event.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {event.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" />
            {event.going_count.toLocaleString("en-NG")} going
            {event.interested_count > 0
              ? ` · ${event.interested_count.toLocaleString("en-NG")} interested`
              : ""}
          </span>
          {event.organizer ? (
            <span>
              by{" "}
              <Link
                href={`/members/${event.organizer.username}`}
                className="hover:underline"
              >
                {event.organizer.full_name}
              </Link>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
