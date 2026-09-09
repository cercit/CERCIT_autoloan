import { cn } from "@/lib/utils";
import { useState } from "react";

export type FeedItem = {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
  type?: "info" | "success" | "warning" | "error";
};

interface ActivityFeedProps {
  items: FeedItem[];
  maxItems?: number;
  className?: string;
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(diffMs / 60000) || 1;
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const typeColorMap: Record<string, string> = {
  info: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
};

export function ActivityFeed({
  items,
  maxItems = 10,
  className,
}: ActivityFeedProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, maxItems);
  const remaining = Math.max(0, items.length - maxItems);

  return (
    <div className={cn("w-full", className)}>
      <div>
        {visibleItems.map((item, index) => {
          const isLast = index === visibleItems.length - 1;
          const type = item.type ?? "info";
          return (
            <div key={item.id} className="flex gap-4">
              <div className="relative w-6 flex-shrink-0 flex flex-col items-center">
                <div
                  className={cn(
                    "w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm",
                    typeColorMap[type] ?? typeColorMap['info']
                  )}
                />
                {!isLast && (
                  <div className="w-[2px] flex-1 bg-border" />
                )}
              </div>
              <div className="flex-1 pb-6">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {item.actor}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{item.action}</p>
              </div>
            </div>
          );
        })}
      </div>
      {remaining > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Show {remaining} more
        </button>
      )}
    </div>
  );
}