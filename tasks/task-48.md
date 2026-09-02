# Task 48 — Policy rule check engine (Decision Layer 6)

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `checkPolicyRules(app, income, ltv, bureau)` to `src/lib/engine.ts`. This function evaluates the application against deterministic policy thresholds — FOIR limit, LTV cap, tenure cap, loan amount range, and minimum net surplus. It returns a list of violations with the actual vs limit values.

## Current state

- `src/lib/engine.ts` has `runHardFilters` (task 46), `assessBureau` (task 47), `calculateIncome`, and `calculateLTV` (tasks 42-44)
- `calculateIncome` returns an `IncomeAssessment` type (created in tasks 42-44) with at least `computedIncome`, `foir`, and `netSurplus` fields
- `calculateLTV` returns an `LTVAssessment` type with at least `ltvExShowroom` and `ltvOnRoad` fields
- `assessBureau` returns a `BureauAssessment` type with `band` field
- Policy thresholds are defined in `src/lib/mock-data.ts` as `policyRules` but the engine needs its own deterministic check, not a data-driven one

## Steps

### 1. Define the return type and function in `src/lib/engine.ts`

Import the types you need (they should already exist in engine.ts from prior tasks):

```typescript
export type PolicyViolation = {
  rule: string;
  actual: string;
  limit: string;
};

export type PolicyCheckResult = {
  passed: boolean;
  violations: PolicyViolation[];
};

export function checkPolicyRules(
  app: Application,
  income: IncomeAssessment,
  ltv: LTVAssessment,
  bureau: BureauAssessment
): PolicyCheckResult {
  const violations: PolicyViolation[] = [];

  // FOIR must be below 65%
  if (income.foir >= 65) {
    violations.push({
      rule: "Maximum FOIR",
      actual: `${income.foir.toFixed(1)}%`,
      limit: "65%",
    });
  }

  // LTV within category limit (A/B: 120% ex-showroom, C: 100%)
  const ltvLimit = bureau.band === "C" ? 100 : 120;
  if (ltv.ltvExShowroom > ltvLimit) {
    violations.push({
      rule: "Maximum LTV (ex-showroom)",
      actual: `${ltv.ltvExShowroom.toFixed(1)}%`,
      limit: `${ltvLimit}%`,
    });
  }

  // Tenure cap: 84 months general, 60 for Category C
  const tenureLimit = bureau.band === "C" ? 60 : 84;
  if (app.tenure > tenureLimit) {
    violations.push({
      rule: "Maximum loan tenure",
      actual: `${app.tenure} months`,
      limit: `${tenureLimit} months`,
    });
  }

  // Loan amount range: 1 lakh to 50 lakh
  if (app.loanAmount < 100000) {
    violations.push({
      rule: "Minimum loan amount",
      actual: `Rs ${app.loanAmount.toLocaleString("en-IN")}`,
      limit: "Rs 1,00,000",
    });
  }
  if (app.loanAmount > 5000000) {
    violations.push({
      rule: "Maximum loan amount",
      actual: `Rs ${app.loanAmount.toLocaleString("en-IN")}`,
      limit: "Rs 50,00,000",
    });
  }

  // Net surplus must be > Rs 15,000
  if (income.netSurplus <= 15000) {
    violations.push({
      rule: "Minimum net surplus",
      actual: `Rs ${income.netSurplus.toLocaleString("en-IN")}`,
      limit: "Rs 15,000",
    });
  }

  return { passed: violations.length === 0, violations };
}
```

**Important:** The `IncomeAssessment` and `LTVAssessment` types must already be exported from engine.ts (tasks 42-44). If they are not, check engine.ts and use the actual field names. The fields referenced here (`foir`, `netSurplus`, `ltvExShowroom`) must match what those types actually define. Adjust the field names if different.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `PolicyViolation`, `PolicyCheckResult` types and `checkPolicyRules` function

## Done when

- `npx tsc --noEmit` exits clean
- `checkPolicyRules` accepts Application, IncomeAssessment, LTVAssessment, and BureauAssessment
- Returns `{ passed: boolean, violations: { rule, actual, limit }[] }`
- FOIR >= 65% is a violation
- LTV limit adjusts by category (120% for A/B, 100% for C)
- Tenure limit adjusts by category (84 months general, 60 for C)
- Loan amount must be between 1 lakh and 50 lakh
- Net surplus must exceed Rs 15,000
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new type and function is exported
