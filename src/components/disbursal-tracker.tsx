import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface PipelineStep { name: string; status: "pending" | "in_progress" | "completed" | "failed"; }

export interface DisbursalTrackerProps {
  applicantName: string;
  loanAmount: number;
  dealerName: string;
  steps?: PipelineStep[];
  currentStepIndex?: number;
  className?: string;
}

const DEFAULT_STEPS: PipelineStep[] = [
  { name: "Agreement signed", status: "completed" },
  { name: "NACH registered", status: "completed" },
  { name: "Insurance verified", status: "in_progress" },
  { name: "RC hypothecation", status: "pending" },
  { name: "Disbursal approved", status: "pending" },
  { name: "Amount transferred", status: "pending" },
  { name: "Confirmation sent", status: "pending" },
];

export function DisbursalTracker({ applicantName, loanAmount, dealerName, steps = DEFAULT_STEPS, currentStepIndex = 2, className }: DisbursalTrackerProps) {
  const completed = steps.filter((s) => s.status === "completed").length;
  const progressPct = Math.round((completed / steps.length) * 100);

  const statusIcon = (status: string) => {
    if (status === "completed") return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600">✓</span>;
    if (status === "in_progress") return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 animate-pulse">●</span>;
    if (status === "failed") return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">✗</span>;
    return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground">○</span>;
  };

  return (
    <div className={cn("panel", className)}>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-sm">Disbursal Pipeline</h3>
          <p className="text-xs text-muted-foreground">{applicantName} · {dealerName}</p>
        </div>
        <span className="text-lg font-extrabold text-foreground">{inr(loanAmount)}</span>
      </header>

      <div className="mb-5">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>Progress</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="relative pl-2">
        <div className="absolute left-[15px] top-3 bottom-3 w-px bg-muted" />
        {steps.map((step, i) => (
          <div key={step.name} className="relative flex gap-3 pb-4 last:pb-0">
            <div className="relative z-10 mt-0">{statusIcon(step.status)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-sm font-medium", step.status === "completed" ? "text-foreground" : step.status === "failed" ? "text-red-600" : "text-muted-foreground")}>{step.name}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{i === currentStepIndex ? "In progress" : step.status === "completed" ? "Done" : step.status === "failed" ? "Failed" : "Pending"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
