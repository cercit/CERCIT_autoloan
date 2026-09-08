import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface DashboardKPIRowProps {
  totalApplications: number;
  applicationsToday: number;
  approvalRatePercent: number;
  declinedPercent: number;
  pendingPercent: number;
  avgProcessingHours: number;
  totalDisbursed: number;
  className?: string;
}

function formatCompactInr(amount: number): string {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(2)}L`;
  return inr(amount);
}

export function DashboardKPIRow({ totalApplications, applicationsToday, approvalRatePercent, declinedPercent, pendingPercent, avgProcessingHours, totalDisbursed, className }: DashboardKPIRowProps) {
  const avgColor = avgProcessingHours <= 4 ? "text-green-600" : avgProcessingHours <= 12 ? "text-amber-600" : "text-red-600";

  const donut = (approved: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((approved / total) * 100);
  };

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {/* Card 1: Total applications */}
      <div className="panel">
        <p className="text-xs text-muted-foreground">Applications</p>
        <p className="text-2xl font-extrabold text-foreground">{totalApplications}</p>
        <span className="inline-block rounded-full bg-green-50 text-green-700 px-1.5 py-0.5 text-[10px] font-semibold mt-1">+{applicationsToday} today</span>
      </div>

      {/* Card 2: Approval rate with donut */}
      <div className="panel">
        <p className="text-xs text-muted-foreground">Approval rate</p>
        <div className="flex items-center gap-3">
          <p className="text-2xl font-extrabold text-foreground">{approvalRatePercent}%</p>
          <svg width="48" height="48" viewBox="0 0 48 48" className="transform -rotate-90">
            <circle cx="24" cy="24" r="20" fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <circle cx="24" cy="24" r="20" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray={`${(approvalRatePercent / 100) * (2 * Math.PI * 20)} ${(2 * Math.PI * 20)}`} strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex gap-1 text-[10px] text-muted-foreground mt-1">
          <span>App: {approvalRatePercent}%</span>
          <span>·</span>
          <span>Dec: {declinedPercent}%</span>
          <span>·</span>
          <span>Pen: {pendingPercent}%</span>
        </div>
      </div>

      {/* Card 3: Avg processing time */}
      <div className="panel">
        <p className="text-xs text-muted-foreground">Avg processing</p>
        <p className={cn("text-2xl font-extrabold", avgColor)}>{avgProcessingHours.toFixed(1)}h</p>
        <p className="text-[10px] text-muted-foreground mt-1">Target: &lt;4 hours</p>
      </div>

      {/* Card 4: Total disbursed */}
      <div className="panel">
        <p className="text-xs text-muted-foreground">Disbursed (MTD)</p>
        <p className="text-2xl font-extrabold text-foreground">{formatCompactInr(totalDisbursed)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">Across {totalApplications} applications</p>
      </div>
    </div>
  );
}
