import { TrendingUp, TrendingDown } from "lucide-react";
import { SectionCard } from "@/components/app-shell";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BankStatementSummary as BankSummaryType } from "@/lib/mock-data";

type MetricCard = {
  label: string;
  value: string;
  good: boolean;
};

function buildMetrics(data: BankSummaryType): MetricCard[] {
  return [
    {
      label: "Avg Monthly Balance",
      value: inr(data.avgMonthlyBalance),
      good: data.avgMonthlyBalance > 50000,
    },
    {
      label: `Salary Credits (${data.salaryCreditCount}/${data.months} months)`,
      value: inr(data.avgSalaryAmount),
      good: data.salaryCreditCount >= data.months,
    },
    {
      label: `EMI Debits (${data.emiDebitCount} txns)`,
      value: inr(data.emiDebitTotal),
      good: true,
    },
    {
      label: "Cash Deposits",
      value: inr(data.cashDeposits),
      good: data.cashDeposits < 100000,
    },
    {
      label: "Cheque Bounces (Inward)",
      value: String(data.chequeBounceInward),
      good: data.chequeBounceInward === 0,
    },
    {
      label: "Cheque Bounces (Outward)",
      value: String(data.chequeBounceOutward),
      good: data.chequeBounceOutward === 0,
    },
    {
      label: "Min Balance Breaches",
      value: String(data.minBalanceBreaches),
      good: data.minBalanceBreaches === 0,
    },
  ];
}

export function BankStatementSummary({ data }: { data: BankSummaryType }) {
  const metrics = buildMetrics(data);

  return (
    <SectionCard
      title="Bank Statement Analysis"
      description={`${data.months}-month summary`}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-lg font-semibold tabular">{m.value}</p>
              {m.good ? (
                <TrendingUp className="size-4 text-success" />
              ) : (
                <TrendingDown className="size-4 text-destructive" />
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
