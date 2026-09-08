import { useState } from "react";
import { cn } from "@/lib/utils";

export interface PolicyVerdictCardProps {
  decision: "approve" | "review" | "decline";
  bandColor: "green" | "amber" | "red";
  score: number;
  passedChecks: string[];
  failedChecks: { name: string; severity: "hard" | "soft" }[];
  className?: string;
}

export function PolicyVerdictCard({
  decision,
  bandColor,
  score,
  passedChecks,
  failedChecks,
  className,
}: PolicyVerdictCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const headerColor = bandColor === "green" ? "bg-green-500" : bandColor === "amber" ? "bg-amber-500" : "bg-red-500";
  const headerText = decision === "approve" ? "Approved" : decision === "review" ? "Needs Review" : "Declined";

  return (
    <div className={cn("panel overflow-hidden", className)}>
      <div className={cn("h-1.5 w-full", headerColor)} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className={cn("text-lg font-bold", decision === "approve" ? "text-green-600" : decision === "review" ? "text-amber-600" : "text-red-600")}>
            {headerText}
          </h3>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">Score: {score}/100</span>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full text-left text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors"
          >
            Passed checks ({passedChecks.length}) {collapsed ? "+" : "−"}
          </button>
          {!collapsed && (
            <div className="flex flex-wrap gap-1.5">
              {passedChecks.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-xs font-medium">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 5l3 3 5-5"/></svg>
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t space-y-1.5">
          <h4 className="text-sm font-semibold text-foreground">Failed checks</h4>
          {failedChecks.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            failedChecks.map((f) => (
              <div key={f.name} className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", f.severity === "hard" ? "bg-red-500" : "bg-amber-500")} />
                <span className={cn("text-xs", f.severity === "hard" ? "text-red-700 font-medium" : "text-amber-700")}>
                  {f.name} ({f.severity === "hard" ? "hard" : "soft"})
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span>{passedChecks.length + failedChecks.length} rules checked</span>
          <span>{passedChecks.length} passed</span>
        </div>
      </div>
    </div>
  );
}
