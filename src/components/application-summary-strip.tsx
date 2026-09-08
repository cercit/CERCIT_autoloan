import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface ApplicationSummaryStripProps {
  applicantName: string;
  appId: string;
  vehicleModel: string;
  vehicleMake?: string;
  loanAmount: number;
  bureauScore: number;
  status: "pending" | "approved" | "declined" | "review";
  riskGrade: "A" | "B" | "C" | "D" | "E";
  date: string;
  onClick?: () => void;
  className?: string;
}

export function ApplicationSummaryStrip({
  applicantName,
  appId,
  vehicleModel,
  vehicleMake,
  loanAmount,
  bureauScore,
  status,
  riskGrade,
  date,
  onClick,
  className,
}: ApplicationSummaryStripProps) {
  const statusColors = {
    approved: "bg-green-100 text-green-700 border-green-200",
    declined: "bg-red-100 text-red-700 border-red-200",
    review: "bg-amber-100 text-amber-700 border-amber-200",
    pending: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const scoreColors = {
    A: "text-green-600 bg-green-50",
    B: "text-amber-600 bg-amber-50",
    C: "text-amber-700 bg-amber-50",
    D: "text-red-600 bg-red-50",
    E: "text-red-700 bg-red-50",
  };

  const formatAmountCompact = (amount: number) => {
    if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
    return inr(amount);
  };

  return (
    <div
      className={cn("panel cursor-pointer hover:shadow-md transition-shadow", onClick && "cursor-pointer", className)}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{applicantName}</h4>
          <p className="text-xs text-muted-foreground">{appId}</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            {vehicleMake ? `${vehicleMake} ${vehicleModel}` : vehicleModel}
          </span>
          <span className="text-sm font-medium tabular-nums">{formatAmountCompact(loanAmount)}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", scoreColors[riskGrade] ?? "text-muted-foreground bg-muted")}>
            {bureauScore}
          </span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-medium", statusColors[status] ?? "bg-muted")}>{status}</span>
          <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", riskGrade === "A" ? "text-green-600" : riskGrade === "B" ? "text-amber-600" : riskGrade === "C" ? "text-amber-700" : riskGrade === "D" ? "text-red-600" : "text-red-800 bg-red-50")}>
            {riskGrade}
          </span>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      </div>
    </div>
  );
}
