# Task 63 — Cross-document income validation engine

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a `validateIncomeAcrossDocuments` function to `src/lib/engine.ts` that compares income figures extracted from salary slip, Form 16, and bank statement. Flags discrepancies beyond a configurable threshold (default 15%).

## Current state

- `src/lib/engine.ts` has `calculateIncome` and `calculateLTV` functions
- `src/lib/api.ts` has the `Document` type
- Documents are uploaded per application (task 31) with doc_type: salary_slip, form_16, bank_statement
- No cross-document validation exists
- The project uses mock data when Supabase is not configured

## Steps

### 1. Add types and function to `src/lib/engine.ts`

```typescript
export type ExtractedIncome = {
  source: "salary_slip" | "form_16" | "bank_statement";
  monthlyGross: number;
  annualGross: number;
  monthlyNet: number;
};

export type IncomeValidationResult = {
  sources: ExtractedIncome[];
  maxVariance: number;
  threshold: number;
  passed: boolean;
  flags: string[];
};

export function validateIncomeAcrossDocuments(
  incomes: ExtractedIncome[],
  threshold = 15
): IncomeValidationResult {
  if (incomes.length < 2) {
    return { sources: incomes, maxVariance: 0, threshold, passed: true, flags: [] };
  }

  const flags: string[] = [];
  let maxVariance = 0;

  for (let i = 0; i < incomes.length; i++) {
    for (let j = i + 1; j < incomes.length; j++) {
      const a = incomes[i];
      const b = incomes[j];
      const avg = (a.monthlyGross + b.monthlyGross) / 2;
      if (avg === 0) continue;
      const variance = Math.abs(a.monthlyGross - b.monthlyGross) / avg * 100;
      if (variance > maxVariance) maxVariance = variance;
      if (variance > threshold) {
        flags.push(
          `${a.source} vs ${b.source}: ${variance.toFixed(1)}% variance (${a.monthlyGross} vs ${b.monthlyGross})`
        );
      }
    }
  }

  return {
    sources: incomes,
    maxVariance: Math.round(maxVariance * 10) / 10,
    threshold,
    passed: flags.length === 0,
    flags,
  };
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `ExtractedIncome`, `IncomeValidationResult` types and `validateIncomeAcrossDocuments` function

## Done when

- `npx tsc --noEmit` exits clean
- `validateIncomeAcrossDocuments` accepts an array of `ExtractedIncome` and a threshold percentage
- Returns `passed: true` when fewer than 2 sources are provided
- Returns variance flags when any pair of sources exceeds the threshold
- `maxVariance` is the highest pairwise variance found
- No `// # reason:` or `// Self-review` comments in any edited file
