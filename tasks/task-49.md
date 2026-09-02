# Task 49 — Decision band router

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `routeDecision(hardFilters, bureau, income, ltv, policy)` to `src/lib/engine.ts`. This function combines all layer assessments into a single decision: APPROVE, REJECT, or MAYBE (refer for manual review). It also returns reason codes, risk flags, and a suggested interest rate derived from the rate grid.

## Current state

- `src/lib/engine.ts` has:
  - `runHardFilters` → `HardFilterResult` (task 46)
  - `assessBureau` → `BureauAssessment` (task 47)
  - `calculateIncome` → `IncomeAssessment` (tasks 42-44)
  - `calculateLTV` → `LTVAssessment` (tasks 42-44)
  - `checkPolicyRules` → `PolicyCheckResult` (task 48)
- `src/lib/mock-data.ts` exports `rateGrid` with columns `band`, `catA`, `catB`, `catC`

## Steps

### 1. Define the return type and function in `src/lib/engine.ts`

```typescript
import { rateGrid } from "@/lib/mock-data";

export type Decision = "APPROVE" | "REJECT" | "MAYBE";

export type DecisionResult = {
  decision: Decision;
  reasons: string[];
  riskFlags: string[];
  suggestedRate: number;
};

function lookupRate(score: number, band: CibilBand): number {
  // Rate grid rows are sorted by score band descending in mock-data
  // Bands: "780+", "750 – 779", "700 – 749", "650 – 699", "Below 650"
  const col = band === "A" ? "catA" : band === "B" ? "catB" : "catC";
  if (score >= 780) return rateGrid[0]?.[col] ?? 8.75;
  if (score >= 750) return rateGrid[1]?.[col] ?? 8.99;
  if (score >= 700) return rateGrid[2]?.[col] ?? 9.25;
  if (score >= 650) return rateGrid[3]?.[col] ?? 9.95;
  return rateGrid[4]?.[col] ?? 11.5;
}

export function routeDecision(
  hardFilters: HardFilterResult,
  bureau: BureauAssessment,
  income: IncomeAssessment,
  ltv: LTVAssessment,
  policy: PolicyCheckResult
): DecisionResult {
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  // Layer 1: Hard filters — any failure is auto-reject
  if (!hardFilters.passed) {
    return {
      decision: "REJECT",
      reasons: hardFilters.failures,
      riskFlags: [],
      suggestedRate: 0,
    };
  }

  // Layer 2: Bureau reject flags
  if (bureau.reject) {
    return {
      decision: "REJECT",
      reasons: bureau.rejectReasons,
      riskFlags: bureau.flags,
      suggestedRate: 0,
    };
  }

  // Collect all flags
  riskFlags.push(...bureau.flags);

  // Layer 6: Policy rules
  if (!policy.passed) {
    const violationCount = policy.violations.length;
    // 1-2 minor violations → MAYBE; 3+ → REJECT
    if (violationCount >= 3) {
      return {
        decision: "REJECT",
        reasons: policy.violations.map((v) => `${v.rule}: ${v.actual} (limit: ${v.limit})`),
        riskFlags,
        suggestedRate: 0,
      };
    }
    // 1-2 violations → manual review
    reasons.push(
      ...policy.violations.map((v) => `${v.rule}: ${v.actual} (limit: ${v.limit})`)
    );
    return {
      decision: "MAYBE",
      reasons,
      riskFlags,
      suggestedRate: lookupRate(bureau.score, bureau.band),
    };
  }

  // All layers passed — APPROVE
  reasons.push(`CIBIL ${bureau.score} — Band ${bureau.band}`);
  reasons.push(`FOIR ${income.foir.toFixed(1)}% — within limit`);
  reasons.push(`LTV ${ltv.ltvExShowroom.toFixed(1)}% — within limit`);

  return {
    decision: "APPROVE",
    reasons,
    riskFlags,
    suggestedRate: lookupRate(bureau.score, bureau.band),
  };
}
```

**Important:** Verify that `IncomeAssessment` has a `foir` field and `LTVAssessment` has a `ltvExShowroom` field. Adjust field names to match the actual types from tasks 42-44.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `Decision`, `DecisionResult` types, `lookupRate` helper, and `routeDecision` function

## Done when

- `npx tsc --noEmit` exits clean
- `routeDecision` accepts all five layer results and returns `{ decision, reasons, riskFlags, suggestedRate }`
- Hard filter failure → immediate REJECT with failure messages
- Bureau reject flags → REJECT with bureau reasons
- 3+ policy violations → REJECT
- 1-2 policy violations → MAYBE
- All layers pass → APPROVE with rate from grid
- `suggestedRate` is looked up from `rateGrid` based on CIBIL score and category band
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new type and function is exported
