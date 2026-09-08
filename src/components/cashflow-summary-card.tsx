import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface CashflowSummaryCardProps {
  totalCredits: number;
  totalDebits: number;
  avgMonthlyBalance: number;
  avgSalary: number;
  salaryRegularity: number;
  bounceCount: number;
  totalEmiBurden: number;
  cashWithdrawalRatio: number;
  monthCount: number;
  className?: string;
}

export function CashflowSummaryCard({
  totalCredits,
  totalDebits,
  avgMonthlyBalance,
  avgSalary,
  salaryRegularity,
  bounceCount,
  totalEmiBurden,
  cashWithdrawalRatio,
  monthCount,
  className,
}: CashflowSummaryCardProps) {
  const netFlow = totalCredits - totalDebits;
  const creditsPct =
    totalCredits + totalDebits > 0
      ? (totalCredits / (totalCredits + totalDebits)) * 100
      : 0;
  const debitsPct = 100 - creditsPct;

  const regularityColor =
    salaryRegularity >= 90
      ? "bg-green-100 text-green-700"
      : salaryRegularity >= 75
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";

  const bounceColor =
    bounceCount === 0
      ? "bg-green-100 text-green-700"
      : bounceCount <= 2
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";

  const cashRatioColor =
    cashWithdrawalRatio <= 20
      ? "bg-green-100 text-green-700"
      : cashWithdrawalRatio <= 40
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";

  return (
    <div className={cn("panel p-5", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Credits</span>
            <span className="tabular-nums text-green-600 font-medium">
              {inr(totalCredits)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Debits</span>
            <span className="tabular-nums text-red-600 font-medium">
              {inr(totalDebits)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Net Flow</span>
            <span
              className={cn(
                "tabular-nums",
                netFlow >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {inr(netFlow)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Monthly Balance</span>
            <span className="tabular-nums">{inr(avgMonthlyBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Salary Credit</span>
            <span className="tabular-nums">{inr(avgSalary)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total EMI Burden</span>
            <span className="tabular-nums text-red-600 font-medium">
              {inr(totalEmiBurden)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Salary Regularity</span>
            <span
              className={cn(
                "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                regularityColor
              )}
            >
              {salaryRegularity.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cheque Bounces</span>
            <span
              className={cn(
                "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                bounceColor
              )}
            >
              {bounceCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cash Withdrawal Ratio</span>
            <span
              className={cn(
                "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                cashRatioColor
              )}
            >
              {cashWithdrawalRatio.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Period: {monthCount} months</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Credits: {creditsPct.toFixed(1)}%</span>
          <span>Debits: {debitsPct.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500"
            style={{ width: `${creditsPct}%` }}
          />
          <div
            className="h-full bg-red-500"
            style={{ width: `${debitsPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}