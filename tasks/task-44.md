# Task 44 — LTV calculation engine

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `calculateLTV(app: Application)` to `src/lib/engine.ts`. Computes LTV on ex-showroom, LTV on on-road, max allowed LTV by employer category, and an LTV breach flag. Return a typed `LTVAssessment` object.

## Current state

- `src/lib/engine.ts` exists with `calculateIncome` (from task 42)
- `src/lib/mock-data.ts` exports `Application` type with: `loanAmount`, `exShowroom`, `onRoad`, `category` (A/B/C)
- The policy rules (in `mock-data.ts` line ~588) define max LTV: Category A = 120%, B = 110%, C = 90% on ex-showroom
- `copilot-review.tsx` already displays `app.ltvExShowroom` and `app.ltvOnRoad` but these come pre-computed from the API — the engine should compute them independently from the raw numbers

## Steps

### 1. Add `LTVAssessment` type and `calculateLTV` to `src/lib/engine.ts`

```typescript
export type LTVAssessment = {
  ltvExShowroom: number;
  ltvOnRoad: number;
  maxAllowedLtv: number;
  categoryLabel: string;
  breached: boolean;
};

const maxLtvByCategory: Record<string, number> = {
  A: 120,
  B: 110,
  C: 90,
};

export function calculateLTV(app: Application): LTVAssessment {
  const ltvExShowroom =
    app.exShowroom > 0
      ? Math.round((app.loanAmount / app.exShowroom) * 1000) / 10
      : 0;

  const ltvOnRoad =
    app.onRoad > 0
      ? Math.round((app.loanAmount / app.onRoad) * 1000) / 10
      : 0;

  const maxAllowedLtv = maxLtvByCategory[app.category] ?? 90;

  const breached = ltvExShowroom > maxAllowedLtv;

  return {
    ltvExShowroom,
    ltvOnRoad,
    maxAllowedLtv,
    categoryLabel: `Category ${app.category} — max ${maxAllowedLtv}%`,
    breached,
  };
}
```

The `Application` type import should already be at the top of engine.ts from task 42. If not, add it:

```typescript
import type { Application } from "@/lib/mock-data";
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `LTVAssessment` type and `calculateLTV` function

## Done when

- `npx tsc --noEmit` exits clean
- `LTVAssessment` type is exported
- `calculateLTV` is exported and accepts `(app: Application)`
- `ltvExShowroom` = loanAmount / exShowroom * 100, rounded to 1 decimal
- `ltvOnRoad` = loanAmount / onRoad * 100, rounded to 1 decimal
- `maxAllowedLtv` is 120% for A, 110% for B, 90% for C
- `breached` is true when `ltvExShowroom > maxAllowedLtv`
- Handles edge case: zero exShowroom/onRoad returns 0 LTV (no division by zero)
- No `// # reason:` or `// Self-review` comments in any edited file
