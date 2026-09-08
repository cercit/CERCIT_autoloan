import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface IncomeSummaryCardProps {
  grossSalary: number;
  deductions: number;
  netSalary: number;
  otherIncome?: number;
  existingEmis: number;
  proposedEmi: number;
  className?: string;
}

export function IncomeSummaryCard({
  grossSalary,
  deductions,
  netSalary,
  otherIncome = 0,
  existingEmis,
  proposedEmi,
  className,
}: IncomeSummaryCardProps) {
  const totalIncome = netSalary + otherIncome;
  const surplus = totalIncome - existingEmis - proposedEmi;
  const foir =
    totalIncome > 0
      ? ((existingEmis + proposedEmi) / totalIncome) * 100
      : 0;

  const foirColor =
    foir < 40
      ? "bg-green-100 text-green-700"
      : foir < 50
      ? "bg-yellow-100 text-yellow-700"
      : foir < 60
      ? "bg-orange-100 text-orange-700"
      : "bg-red-100 text-red-700";

  return (
    <div className={cn("panel p-5", className)}>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Gross salary</span>
          <span className="tabular-nums">{inr(grossSalary)}</span>
        </div>
        <div className="flex justify-between">
          <span>(-) Deductions</span>
          <span className="tabular-nums">{inr(deductions)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Net salary</span>
          <span className="tabular-nums">{inr(netSalary)}</span>
        </div>
        {otherIncome > 0 && (
          <div className="flex justify-between">
            <span>(+) Other income</span>
            <span className="tabular-nums">{inr(otherIncome)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Total income</span>
          <span className="tabular-nums">{inr(totalIncome)}</span>
        </div>
        <div className="flex justify-between">
          <span>(-) Existing EMIs</span>
          <span className="tabular-nums">{inr(existingEmis)}</span>
        </div>
        <div className="flex justify-between">
          <span>(-) Proposed EMI</span>
          <span className="tabular-nums">{inr(proposedEmi)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Net surplus</span>
          <span
            className={cn(
              "tabular-nums",
              surplus > 0 ? "text-green-600" : "text-red-600"
            )}
          >
            {inr(surplus)}
          </span>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <span
          className={cn(
            "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
            foirColor
          )}
        >
          FOIR: {foir.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}