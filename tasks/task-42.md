# Task 42 — Income calculation engine

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create `src/lib/engine.ts` with a `calculateIncome` function that computes income assessment metrics: declared vs verified income, income variance, net monthly income (after tax estimate), existing EMI total, proposed EMI, FOIR, and DBR. Return a typed `IncomeAssessment` object.

## Current state

- `src/lib/format.ts` exports `emiFor(principal, annualRate, months)` (line ~13)
- `src/lib/mock-data.ts` exports `Application` type with: `netIncome`, `loanAmount`, `rate`, `tenure`, `obligations[]`
- `src/lib/mock-data.ts` exports `BankStatementSummary` type with: `avgSalaryAmount`, `salaryCreditCount`, `months` (from task 39)
- No `engine.ts` file exists yet
- The `copilot-review.tsx` (line ~131-136) already does inline FOIR calculation but it's embedded in the component, not reusable

## Steps

### 1. Create `src/lib/engine.ts`

```typescript
import { emiFor } from "@/lib/format";
import type { Application } from "@/lib/mock-data";
import type { BankStatementSummary } from "@/lib/mock-data";

export type IncomeAssessment = {
  declaredMonthlyIncome: number;
  verifiedMonthlyIncome: number;
  incomeVariancePct: number;
  incomeVarianceFlag: boolean;
  netMonthlyIncome: number;
  existingEmiTotal: number;
  proposedEmi: number;
  totalObligations: number;
  foir: number;
  dbr: number;
  netSurplus: number;
};

export function calculateIncome(
  app: Application,
  banking?: BankStatementSummary,
): IncomeAssessment {
  const declaredMonthlyIncome = app.netIncome;

  const verifiedMonthlyIncome = banking?.avgSalaryAmount ?? declaredMonthlyIncome;

  const variancePct =
    declaredMonthlyIncome > 0
      ? Math.abs(
          ((declaredMonthlyIncome - verifiedMonthlyIncome) / declaredMonthlyIncome) * 100,
        )
      : 0;
  const incomeVarianceFlag = variancePct > 10;

  // Rough tax estimate: 20% for income above Rs 50,000/month
  const grossMonthlyIncome = declaredMonthlyIncome;
  const estimatedTax = grossMonthlyIncome > 50000 ? (grossMonthlyIncome - 50000) * 0.2 : 0;
  const netMonthlyIncome = grossMonthlyIncome - estimatedTax;

  const existingEmiTotal = app.obligations.reduce((sum, o) => sum + o.emi, 0);

  const proposedEmi = emiFor(app.loanAmount, app.rate, app.tenure || 60);

  const totalObligations = existingEmiTotal + proposedEmi;

  // FOIR = (existing EMIs + proposed EMI) / net monthly income
  const foir = netMonthlyIncome > 0 ? (totalObligations / netMonthlyIncome) * 100 : 0;

  // DBR = total obligations / gross monthly income
  const dbr = grossMonthlyIncome > 0 ? (totalObligations / grossMonthlyIncome) * 100 : 0;

  const netSurplus = netMonthlyIncome - totalObligations;

  return {
    declaredMonthlyIncome,
    verifiedMonthlyIncome,
    incomeVariancePct: Math.round(variancePct * 10) / 10,
    incomeVarianceFlag,
    netMonthlyIncome: Math.round(netMonthlyIncome),
    existingEmiTotal,
    proposedEmi,
    totalObligations,
    foir: Math.round(foir * 10) / 10,
    dbr: Math.round(dbr * 10) / 10,
    netSurplus: Math.round(netSurplus),
  };
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — new file

## Done when

- `npx tsc --noEmit` exits clean
- `IncomeAssessment` type is exported
- `calculateIncome` is exported and accepts `(app: Application, banking?: BankStatementSummary)`
- `declaredMonthlyIncome` comes from `app.netIncome`
- `verifiedMonthlyIncome` comes from `banking.avgSalaryAmount` (falls back to declared if no banking data)
- `incomeVarianceFlag` is true when variance exceeds 10%
- `netMonthlyIncome` applies a rough 20% tax estimate on income above Rs 50,000
- `proposedEmi` uses `emiFor` from format.ts
- FOIR = (existing EMIs + proposed EMI) / net income
- DBR = total obligations / gross income
- `netSurplus` = net income minus total obligations
- No `// # reason:` or `// Self-review` comments in any edited file
