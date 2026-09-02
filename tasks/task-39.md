# Task 39 — Bank statement summary component

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create `src/components/bank-statement-summary.tsx` that shows derived banking metrics in a card layout. Each metric is rendered as a `SectionCard` with the value and a trend indicator (up/down arrow). Add `BankStatementSummary` type and mock data to `mock-data.ts`.

## Current state

- `src/lib/mock-data.ts` has no banking-related types
- `src/components/app-shell.tsx` exports `SectionCard` and `LabelValue`
- `src/lib/format.ts` exports `inr()`
- `src/lib/utils.ts` exports `cn()`
- `lucide-react` provides `TrendingUp` and `TrendingDown` icons

## Steps

### 1. Add `BankStatementSummary` type and mock to `src/lib/mock-data.ts`

Add at the end of the file:

```typescript
export type BankStatementSummary = {
  avgMonthlyBalance: number;
  salaryCreditCount: number;
  avgSalaryAmount: number;
  emiDebitCount: number;
  emiDebitTotal: number;
  cashDeposits: number;
  chequeBounceInward: number;
  chequeBounceOutward: number;
  minBalanceBreaches: number;
  months: number;
};

export const mockBankStatementSummary: BankStatementSummary = {
  avgMonthlyBalance: 142300,
  salaryCreditCount: 6,
  avgSalaryAmount: 83450,
  emiDebitCount: 12,
  emiDebitTotal: 162000,
  cashDeposits: 25000,
  chequeBounceInward: 0,
  chequeBounceOutward: 1,
  minBalanceBreaches: 0,
  months: 6,
};
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/bank-statement-summary.tsx`

```typescript
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
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/mock-data.ts` — add `BankStatementSummary` type and `mockBankStatementSummary`
- `src/components/bank-statement-summary.tsx` — new file

## Done when

- `npx tsc --noEmit` exits clean
- `BankStatementSummary` type is exported from `mock-data.ts`
- `mockBankStatementSummary` has realistic values for a salaried applicant
- Component renders 7 metric cards in a responsive grid
- Each card shows label, value, and a trend indicator (green up for good, red down for bad)
- Uses `SectionCard` from app-shell and `inr()` from format
- No `// # reason:` or `// Self-review` comments in any edited file
