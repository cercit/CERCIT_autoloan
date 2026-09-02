# Task 65 — Cross-document employer name check

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a function that checks whether the employer name in the salary slip matches the employer name in Form 16 and bank statement credit narration. Display match/mismatch status on the application detail page.

## Current state

- `src/lib/engine.ts` has income validation functions (tasks 63-64)
- `src/components/copilot-review.tsx` has Collapsible sections for various checks
- `Application` type in `src/lib/api.ts` has `employer` field
- No employer cross-check exists

## Steps

### 1. Add `checkEmployerConsistency` to `src/lib/engine.ts`

```typescript
export type EmployerCheckResult = {
  salarySlipEmployer: string;
  form16Employer: string;
  bankNarration: string;
  allMatch: boolean;
  mismatches: string[];
};

export function checkEmployerConsistency(
  salarySlipEmployer: string,
  form16Employer: string,
  bankNarration: string
): EmployerCheckResult {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mismatches: string[] = [];

  const salNorm = normalize(salarySlipEmployer);
  const f16Norm = normalize(form16Employer);
  const bankNorm = normalize(bankNarration);

  if (salNorm && f16Norm && salNorm !== f16Norm) {
    mismatches.push(`Salary slip ("${salarySlipEmployer}") differs from Form 16 ("${form16Employer}")`);
  }
  if (salNorm && bankNorm && !bankNorm.includes(salNorm) && !salNorm.includes(bankNorm)) {
    mismatches.push(`Bank narration ("${bankNarration}") does not contain salary slip employer name`);
  }

  return {
    salarySlipEmployer,
    form16Employer,
    bankNarration,
    allMatch: mismatches.length === 0,
    mismatches,
  };
}
```

Run `npx tsc --noEmit`.

### 2. Add employer check display to `src/components/copilot-review.tsx`

Import `checkEmployerConsistency` and call it with the application's employer name (used for all three sources as mock data — in production, each source would have its own extracted employer).

Add a small section inside the "Cross-Document Income Check" Collapsible (task 64) showing:
- "Employer check: Match" (green pill) or "Employer check: Mismatch" (red pill) with the mismatch details listed below

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `EmployerCheckResult` type and `checkEmployerConsistency` function
- `src/components/copilot-review.tsx` — import and display employer check results

## Done when

- `npx tsc --noEmit` exits clean
- `checkEmployerConsistency` normalizes employer names (lowercase, strip non-alphanumeric) before comparing
- Returns `allMatch: true` when names are consistent
- Returns specific mismatch descriptions when they differ
- Employer check result displays in the copilot review section
- No `// # reason:` or `// Self-review` comments in any edited file
