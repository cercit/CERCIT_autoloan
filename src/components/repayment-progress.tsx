import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface RepaymentProgressProps {
  totalEmis: number;
  paidEmis: number;
  emiAmount: number;
  totalPrincipal: number;
  principalPaid: number;
  className?: string;
}

export function RepaymentProgress({
  totalEmis,
  paidEmis,
  emiAmount,
  totalPrincipal,
  principalPaid,
  className,
}: RepaymentProgressProps) {
  const percentage = totalEmis > 0 ? Math.round((paidEmis / totalEmis) * 100) : 0;
  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <div className="relative">
        <svg width="120" height="120" viewBox="0 0 120 120" className="rotate-[-90deg]">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted"
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-primary"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{percentage}%</span>
          <span className="text-xs text-muted-foreground">completed</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">EMIs paid</span>
          <span className="text-sm font-semibold tabular-nums">
            {paidEmis} / {totalEmis}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">EMIs remaining</span>
          <span className="text-sm font-semibold tabular-nums">
            {totalEmis - paidEmis}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">Principal paid</span>
          <span className="text-sm font-semibold tabular-nums">{inr(principalPaid)}</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">Outstanding</span>
          <span className="text-sm font-semibold tabular-nums">{inr(totalPrincipal - principalPaid)}</span>
        </div>
      </div>
    </div>
  );
}