import { FileText, Clock, Search, CheckCircle, XCircle, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getApplicationTimeline, type TimelineEvent } from "@/lib/api";
import { useEffect, useState } from "react";

const iconMap: Record<string, typeof FileText> = {
  APPLICATION_CREATED: FileText,
  SUBMITTED: Clock,
  ASSESSMENT_COMPLETED: Search,
  OFFICER_APPROVED: CheckCircle,
  OFFICER_REJECTED: XCircle,
  OFFICER_REFERRED: UserCheck,
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.round(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function readableAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function ApplicationTimeline({ applicationId }: { applicationId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getApplicationTimeline(applicationId).then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, [applicationId]);

  if (loading) return <div className="text-xs text-muted-foreground">Loading timeline...</div>;
  if (events.length === 0) return <div className="text-xs text-muted-foreground">No timeline events.</div>;

  const Icon = (a: string) => {
    const Comp = iconMap[a] || FileText;
    return <Comp className="size-4 shrink-0 text-muted-foreground" />;
  };

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
      <div className="space-y-4">
        {events.map((event, i) => (
          <div key={i} className="relative flex gap-3">
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-sm">
              {Icon(event.stage || "")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{readableAction(event.stage || "")}</span>
                <span className="text-[11px] text-muted-foreground">{formatRelative(event.timestamp || "")}</span>
              </div>
              <div className="text-xs text-muted-foreground">{event.actor || ""}</div>
              {event.detail && <div className="mt-0.5 text-xs text-muted-foreground">{event.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
