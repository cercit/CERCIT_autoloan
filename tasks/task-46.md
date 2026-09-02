# Task 46 — Hard filter engine (Decision Layer 1)

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `runHardFilters(app: Application)` to `src/lib/engine.ts`. This function runs the binary pass/fail checks that form Decision Layer 1 — the first gate an application hits. Any single failure means auto-reject. The checks are: age between 21 and 60, CIBIL score at least 600, PAN is not empty, city is not empty, and loan amount greater than zero.

## Current state

- `src/lib/engine.ts` does not exist yet — tasks 42-44 create it with `calculateIncome` and `calculateLTV`. This task adds the first decision-layer function.
- `src/lib/mock-data.ts` exports the `Application` type with fields `age`, `cibil`, `pan`, `city`, and `loanAmount`
- No hard-filter logic exists anywhere in the frontend

## Steps

### 1. Define the return type and function in `src/lib/engine.ts`

If `engine.ts` already exists from prior tasks, add to it. If not, create the file.

```typescript
import type { Application } from "@/lib/mock-data";

export type HardFilterResult = {
  passed: boolean;
  failures: string[];
};

export function runHardFilters(app: Application): HardFilterResult {
  const failures: string[] = [];

  if (app.age < 21) failures.push("Applicant age below minimum (21)");
  if (app.age > 60) failures.push("Applicant age above maximum (60)");
  if (app.cibil < 600) failures.push(`CIBIL score ${app.cibil} below hard floor (600)`);
  if (!app.pan.trim()) failures.push("PAN number is missing");
  if (!app.city.trim()) failures.push("City is missing");
  if (app.loanAmount <= 0) failures.push("Loan amount must be greater than zero");

  return { passed: failures.length === 0, failures };
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `HardFilterResult` type and `runHardFilters` function

## Done when

- `npx tsc --noEmit` exits clean
- `runHardFilters` accepts an `Application` and returns `{ passed: boolean, failures: string[] }`
- Each of the 5 checks (age min, age max, CIBIL floor, PAN present, city present, loan > 0) produces a distinct failure message
- An application that passes all checks returns `{ passed: true, failures: [] }`
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new function is exported
