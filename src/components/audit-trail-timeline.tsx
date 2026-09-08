import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/lib/supabase-audit-trail";

export interface AuditTrailTimelineProps {
  entries: AuditEntry[];
  className?: string;
}

export function AuditTrailTimeline({ entries, className }: AuditTrailTimelineProps) {
  const [showOlder, setShowOlder] = useState(false);
  const display = showOlder ? entries : entries.slice(0, 10);

  const isPositive = (action: string) => ["application_created", "decision_logged", "cam_generated", "esign_completed"].includes(action);
  const isNegative = (action: string) => ["override_applied", "status_changed"].includes(action) || action.includes("decline");

  return (
    <div className={cn("panel", className)}>
      <h3 className="text-sm font-semibold tracking-tight mb-4">Audit Trail</h3>
      <div className="relative pl-3">
        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
        {display.map((entry, i) => {
          const positive = isPositive(entry.action);
          const negative = isNegative(entry.action);
          const dotColor = positive ? "bg-green-500" : negative ? "bg-red-500" : "bg-blue-400";
          return (
            <div key={entry.id || i} className="relative flex gap-4 pb-4 last:pb-0">
              <div className={cn("relative z-10 w-2 h-2 rounded-full mt-1 flex-shrink-0 border-2 border-white shadow-sm", dotColor)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{entry.action.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(entry.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Actor: <span className="font-medium text-foreground">{entry.actor}</span></p>
                {entry.detail && Object.keys(entry.detail).length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {Object.entries(entry.detail).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {entries.length > 10 && !showOlder && (
        <button
          onClick={() => setShowOlder(true)}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Show older ({entries.length - 10} more)
        </button>
      )}
    </div>
  );
}
