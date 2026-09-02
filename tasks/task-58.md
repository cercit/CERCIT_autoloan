# Task 58 — Fraud flag engine

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `detectFraudFlags(app, banking?)` to `src/lib/engine.ts`. This function checks for common fraud indicators — salary mismatch, multiple employer credits, large cash deposits, invalid PAN format, and suspicious age-to-loan patterns. Returns typed flags with severity levels.

## Current state

- `src/lib/engine.ts` has the assessment pipeline (tasks 42-50)
- `src/lib/mock-data.ts` has `Application` type with `pan`, `age`, `loanAmount`, `netIncome`, and `obligations`
- No `BankStatementSummary` type exists — needs to be defined
- No fraud detection logic exists in the frontend

## Steps

### 1. Define `BankStatementSummary` type in `src/lib/mock-data.ts`

Add after the `BureauReport` type:

```typescript
export type BankStatementSummary = {
  avgMonthlySalaryCredit: number;
  salaryCreditsPerMonth: number[];
  employerNames: string[];
  largeCashDeposits: number;
  avgMonthlyBalance: number;
  months: number;
};
```

### 2. Define fraud types and function in `src/lib/engine.ts`

```typescript
import type { BankStatementSummary } from "@/lib/mock-data";

export type FraudFlag = {
  type: string;
  severity: "high" | "medium" | "low";
  detail: string;
};

export type FraudCheckResult = {
  flags: FraudFlag[];
};

export function detectFraudFlags(
  app: Application,
  banking?: BankStatementSummary
): FraudCheckResult {
  const flags: FraudFlag[] = [];

  // 1. PAN format validation: AAAAA9999A pattern
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  if (app.pan && !panRegex.test(app.pan.trim().toUpperCase())) {
    flags.push({
      type: "Invalid PAN format",
      severity: "high",
      detail: `PAN "${app.pan}" does not match expected format (AAAAA9999A)`,
    });
  }

  // 2. Age below 23 with high loan amount (>15L)
  if (app.age < 23 && app.loanAmount > 1500000) {
    flags.push({
      type: "Young applicant with high loan",
      severity: "medium",
      detail: `Applicant age ${app.age} with loan amount Rs ${app.loanAmount.toLocaleString("en-IN")} (>15L threshold)`,
    });
  }

  // Banking-dependent checks (only if bank statement data is available)
  if (banking) {
    // 3. Salary mismatch >20% between declared and bank statement
    if (banking.avgMonthlySalaryCredit > 0) {
      const variance = Math.abs(app.netIncome - banking.avgMonthlySalaryCredit) / banking.avgMonthlySalaryCredit;
      if (variance > 0.2) {
        flags.push({
          type: "Salary mismatch",
          severity: "high",
          detail: `Declared income Rs ${app.netIncome.toLocaleString("en-IN")} vs bank credit Rs ${banking.avgMonthlySalaryCredit.toLocaleString("en-IN")} — ${(variance * 100).toFixed(1)}% variance (>20% threshold)`,
        });
      }
    }

    // 4. Multiple employer salary credits in same month
    if (banking.employerNames.length > 1) {
      flags.push({
        type: "Multiple employer credits",
        severity: "medium",
        detail: `Salary credits from ${banking.employerNames.length} employers: ${banking.employerNames.join(", ")}`,
      });
    }

    // 5. Large cash deposits before loan application (>50% of salary)
    if (banking.largeCashDeposits > app.netIncome * 0.5) {
      flags.push({
        type: "Large cash deposits",
        severity: "medium",
        detail: `Cash deposits Rs ${banking.largeCashDeposits.toLocaleString("en-IN")} exceed 50% of monthly salary Rs ${app.netIncome.toLocaleString("en-IN")}`,
      });
    }
  }

  return { flags };
}
```

Run `npx tsc --noEmit`.

### 3. Integrate into `runAssessment` (optional enhancement)

In `src/lib/engine.ts`, update the `AssessmentResult` type to include fraud flags, and call `detectFraudFlags` in `runAssessment`:

Add to `AssessmentResult`:

```typescript
export type AssessmentResult = {
  // ...existing fields...
  fraud: FraudCheckResult;
};
```

In `runAssessment`, add:

```typescript
const fraud = detectFraudFlags(app);
```

And include `fraud` in the return object. Update the type accordingly.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/mock-data.ts` — add `BankStatementSummary` type
- `src/lib/engine.ts` — add `FraudFlag`, `FraudCheckResult` types, `detectFraudFlags` function, update `AssessmentResult` and `runAssessment`

## Done when

- `npx tsc --noEmit` exits clean
- `detectFraudFlags(app)` works without bank statement data (checks PAN and age)
- `detectFraudFlags(app, banking)` runs all 5 checks when banking data is provided
- PAN regex validates `AAAAA9999A` format
- Salary mismatch threshold is 20%
- Cash deposit threshold is 50% of salary
- Each flag has `type`, `severity` (high/medium/low), and `detail`
- `AssessmentResult` includes `fraud: FraudCheckResult`
- `runAssessment` calls `detectFraudFlags`
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new type and function is exported
