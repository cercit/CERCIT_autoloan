# Task 50 — Run full assessment pipeline

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `runAssessment(app: Application)` to `src/lib/engine.ts` — the single entry point that orchestrates all decision layers in sequence. It calls hard filters, bureau assessment, income calculation, LTV calculation, policy check, and decision routing, then returns a complete `AssessmentResult` containing every layer's output plus the final decision. This is what the UI will call.

## Current state

- `src/lib/engine.ts` has all layer functions:
  - `runHardFilters(app)` → `HardFilterResult` (task 46)
  - `assessBureau(app, bureau)` → `BureauAssessment` (task 47)
  - `calculateIncome(app)` → `IncomeAssessment` (tasks 42-44)
  - `calculateLTV(app)` → `LTVAssessment` (tasks 42-44)
  - `checkPolicyRules(app, income, ltv, bureau)` → `PolicyCheckResult` (task 48)
  - `routeDecision(hardFilters, bureau, income, ltv, policy)` → `DecisionResult` (task 49)
- `src/lib/mock-data.ts` exports `buildMockBureau(app)` → `BureauReport` (task 47)

## Steps

### 1. Define `AssessmentResult` type and `runAssessment` function in `src/lib/engine.ts`

```typescript
import { buildMockBureau, type BureauReport } from "@/lib/mock-data";

export type AssessmentResult = {
  hardFilters: HardFilterResult;
  bureau: BureauAssessment;
  income: IncomeAssessment;
  ltv: LTVAssessment;
  policy: PolicyCheckResult;
  decision: DecisionResult;
  timestamp: string;
};

export function runAssessment(
  app: Application,
  bureauData?: BureauReport
): AssessmentResult {
  const bureau_report = bureauData ?? buildMockBureau(app);

  // Layer 1: Hard filters
  const hardFilters = runHardFilters(app);

  // Layer 2: Bureau assessment
  const bureau = assessBureau(app, bureau_report);

  // Layer 3: Income calculation
  const income = calculateIncome(app);

  // Layer 4: LTV calculation
  const ltv = calculateLTV(app);

  // Layer 6: Policy rules
  const policy = checkPolicyRules(app, income, ltv, bureau);

  // Decision routing
  const decision = routeDecision(hardFilters, bureau, income, ltv, policy);

  return {
    hardFilters,
    bureau,
    income,
    ltv,
    policy,
    decision,
    timestamp: new Date().toISOString(),
  };
}
```

The `bureauData` parameter is optional — when not provided, `buildMockBureau(app)` generates a bureau report from the application's existing data. This lets the function work without real bureau pull data during development.

Run `npx tsc --noEmit`.

### 2. Verify all internal function calls match actual signatures

Check the actual signatures of `calculateIncome` and `calculateLTV` in engine.ts. They may take different parameters. Adjust the calls to match. For example, if `calculateIncome` takes `(app, obligations)` or `(netIncome, obligations, proposedEmi)`, match that signature.

Run `npx tsc --noEmit` again after any adjustments.

## Files to edit

- `src/lib/engine.ts` — add `AssessmentResult` type and `runAssessment` function

## Done when

- `npx tsc --noEmit` exits clean
- `runAssessment(app)` works with no extra arguments (uses mock bureau data)
- `runAssessment(app, bureauData)` accepts an optional `BureauReport`
- Returns `AssessmentResult` containing all layer outputs plus `decision` and `timestamp`
- Layers execute in order: hardFilters → bureau → income → LTV → policy → decision
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new type and function is exported
