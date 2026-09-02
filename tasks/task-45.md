# Task 45 — LTV display in copilot review

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Import `calculateLTV` in `copilot-review.tsx` and display the LTV assessment below the income section (task 43). Show: LTV (ex-showroom) with bar, LTV (on-road) with bar, Max allowed LTV for this category, and a Pass/Fail indicator. Color the bar green if within limit, red if breached.

## Current state

- `src/lib/engine.ts` exports `calculateLTV(app)` and `LTVAssessment` type (from task 44)
- `src/components/copilot-review.tsx` already has a "Vehicle & LTV" Collapsible section (line ~409) that uses `app.ltvExShowroom` and `app.ltvOnRoad` with `MeterBar`
- `src/components/copilot-review.tsx` already imports `MeterBar` from status.tsx and `LabelValue` from app-shell
- `src/components/status.tsx` exports `Pill` with tone support
- `lucide-react` `Check` and `X` icons are already imported in copilot-review.tsx

## Steps

### 1. Import `calculateLTV` in `src/components/copilot-review.tsx`

Update the existing engine import:

```typescript
import { calculateIncome, calculateLTV } from "@/lib/engine";
import type { IncomeAssessment, LTVAssessment } from "@/lib/engine";
```

### 2. Call `calculateLTV` in the component

Inside the `CopilotReview` function, after the `incomeAssessment` call:

```typescript
const ltvAssessment = calculateLTV(app);
```

### 3. Add an "LTV Assessment (Engine)" Collapsible section

Add a new `Collapsible` section after the "Income & Affordability (Engine)" section added in task 43:

```tsx
<Collapsible title="LTV Assessment (Engine)">
  <div className="space-y-4">
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span>LTV on ex-showroom</span>
        <span
          className={cn(
            "font-semibold tabular",
            ltvAssessment.breached ? "text-destructive" : "text-success",
          )}
        >
          {ltvAssessment.ltvExShowroom}%
        </span>
      </div>
      <MeterBar
        value={ltvAssessment.ltvExShowroom}
        max={150}
        threshold={ltvAssessment.maxAllowedLtv}
        tone={ltvAssessment.breached ? "destructive" : "success"}
      />
    </div>

    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span>LTV on on-road</span>
        <span className="font-semibold tabular">{ltvAssessment.ltvOnRoad}%</span>
      </div>
      <MeterBar
        value={ltvAssessment.ltvOnRoad}
        max={150}
        threshold={100}
        tone={ltvAssessment.ltvOnRoad > 100 ? "destructive" : "success"}
      />
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <LabelValue
        label="Max allowed LTV"
        value={ltvAssessment.categoryLabel}
      />
      <LabelValue
        label="LTV check"
        value={
          ltvAssessment.breached ? (
            <span className="flex items-center gap-1.5 text-destructive">
              <X className="size-4" /> Breached
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-success">
              <Check className="size-4" /> Pass
            </span>
          )
        }
      />
    </div>
  </div>
</Collapsible>
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/components/copilot-review.tsx` — import `calculateLTV`, call it, add LTV Assessment section

## Done when

- `npx tsc --noEmit` exits clean
- `calculateLTV(app)` is called inside the `CopilotReview` component
- New "LTV Assessment (Engine)" Collapsible section renders
- LTV (ex-showroom) shown with `MeterBar` — green within limit, red if breached
- LTV (on-road) shown with `MeterBar` — threshold at 100%
- Max allowed LTV displayed with category label (e.g. "Category A — max 120%")
- Pass/Fail indicator with Check or X icon and colored text
- Existing "Vehicle & LTV" section still present (the new section supplements it with engine-calculated values)
- No `// # reason:` or `// Self-review` comments in any edited file
