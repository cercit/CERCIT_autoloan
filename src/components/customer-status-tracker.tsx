import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface StatusTrackerProps {
  applicantName: string;
  appId: string;
  loanAmount: number;
  vehicle: string;
  currentStatus: string;
  currentStatusIndex: number;
  stages: string[];
  history?: { date: string; status: string; note?: string }[];
  nextAction?: string;
  className?: string;
}

export function CustomerStatusTracker({ applicantName, appId, loanAmount, vehicle, currentStatus, currentStatusIndex, stages, history = [], nextAction, className }: StatusTrackerProps) {
  return (
    <div className={cn("panel", className)}>
      <header className="mb-4 border-b pb-3">
        <h3 className="font-semibold">{applicantName}</h3>
        <p className="text-xs text-muted-foreground">App ID: {appId} · Vehicle: {vehicle}</p>
        <p className="text-sm font-medium mt-1">{inr(loanAmount)}</p>
      </header>

      <div className="flex gap-0.5 mb-5 overflow-x-auto">
        {stages.map((stage, i) => (
          <div key={stage} className="flex-1 min-w-[70px] flex flex-col items-center text-center relative">
            <div className={cn("w-3 h-3 rounded-full mb-1.5", i < currentStatusIndex ? "bg-green-500" : i === currentStatusIndex ? "bg-blue-500 animate-pulse" : "bg-muted")} />
            <span className={cn("text-[9px] font-medium leading-tight", i <= currentStatusIndex ? "text-foreground" : "text-muted-foreground")}>{stage}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/20 p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn("w-2.5 h-2.5 rounded-full", currentStatus === "approved" ? "bg-green-500" : currentStatus === "declined" ? "bg-red-500" : currentStatus === "review" ? "bg-amber-500" : "bg-blue-500")} />
          <span className="text-xl font-bold">{currentStatus.toUpperCase()}</span>
        </div>
        <p className="text-xs text-muted-foreground">{currentStatusIndex + 1} of {stages.length} stages completed</p>
      </div>

      {nextAction && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 mb-4">
          <p className="text-xs font-semibold text-blue-800">Next action</p>
          <p className="text-sm text-blue-900">{nextAction}</p>
        </div>
      )}

      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Status history</h4>
      <div className="space-y-2">
        {history.map((h, i) => (
          <div key={i} className="flex items-start gap-3 text-xs">
            <span className="text-muted-foreground whitespace-nowrap">{h.date}</span>
            <span className="font-medium text-foreground">{h.status}</span>
            {h.note && <span className="text-muted-foreground truncate">{h.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
