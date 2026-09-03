import type { TimelineEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ApplicationTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={`${event.stage}-${event.timestamp}`} className="relative">
            <span
              className={cn(
                "absolute -left-[25px] top-1.5 size-3 rounded-full border-2 border-background",
                isLast ? "bg-primary animate-pulse" : "bg-muted-foreground/50",
              )}
            />
            <p className="text-sm font-semibold">{event.stage}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(event.timestamp).toLocaleString("en-IN")} · {relativeTime(event.timestamp)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {event.actor} — {event.detail}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
