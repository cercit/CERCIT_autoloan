# Task 43 — FOIR/DBR display in copilot review

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Import `calculateIncome` in `copilot-review.tsx` and display the income assessment as a new section. Show: Declared vs Verified income (with variance flag if >10%), FOIR gauge (green <50%, amber 50-65%, red >65%), DBR percentage, and Net surplus after EMIs. Use existing `LabelValue`, `SectionCard`, and `MeterBar` from the project.

## Current state

- `src/lib/engine.ts` exports `calculateIncome(app, banking?)` and `IncomeAssessment` type (from task 42)
- `src/components/copilot-review.tsx` already has inline FOIR calculation (lines ~131-136) and renders an "Obligations & FOIR" Collapsible section (line ~344)
- `src/components/copilot-review.tsx` uses `LabelValue`, `SectionCard`, `MeterBar`, `Pill` from existing components
- `src/lib/format.ts` exports `inr()` and `pct()`
- `src/components/status.tsx` exports `MeterBar` with `value`, `max`, `threshold`, `tone` props

## Steps

### 1. Import `calculateIncome` in `src/components/copilot-review.tsx`

```typescript
import { calculateIncome } from "@/lib/engine";
import type { IncomeAssessment } from "@/lib/engine";
```

### 2. Call `calculateIncome` in the component

Inside the `CopilotReview` function, after the existing variable declarations, call the engine:

```typescript
const incomeAssessment = calculateIncome(app);
```

Note: For now, pass only `app` (no banking data). When task 41 is complete, the banking data can be passed as the second argument.

### 3. Add an "Income & Affordability" Collapsible section

Add a new `Collapsible` section after the existing "Income Assessment" section (or replace it — the existing one at line ~247 shows mock `incomeSources`). Place this as a peer of the existing Collapsible sections in the left column:

```tsx
<Collapsible title="Income & Affordability (Engine)">
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <LabelValue
      label="Declared monthly income"
      value={inr(incomeAssessment.declaredMonthlyIncome)}
    />
    <LabelValue
      label="Verified monthly income"
      value={inr(incomeAssessment.verifiedMonthlyIncome)}
    />
    <LabelValue
      label="Income variance"
      value={
        <span className={incomeAssessment.incomeVarianceFlag ? "text-destructive" : "text-success"}>
          {incomeAssessment.incomeVariancePct}%
          {incomeAssessment.incomeVarianceFlag && " — exceeds 10%"}
        </span>
      }
    />
    <LabelValue label="Net monthly income" value={inr(incomeAssessment.netMonthlyIncome)} />
    <LabelValue label="Existing EMI total" value={inr(incomeAssessment.existingEmiTotal)} />
    <LabelValue label="Proposed EMI" value={inr(incomeAssessment.proposedEmi)} />
  </div>

  <div className="mt-4 space-y-4">
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">FOIR</span>
        <span
          className={cn(
            "font-semibold tabular",
            incomeAssessment.foir > 65
              ? "text-destructive"
              : incomeAssessment.foir > 50
                ? "text-warning"
                : "text-success",
          )}
        >
          {incomeAssessment.foir}%
        </span>
      </div>
      <MeterBar
        value={incomeAssessment.foir}
        max={80}
        threshold={50}
        tone={
          incomeAssessment.foir > 65
            ? "destructive"
            : incomeAssessment.foir > 50
              ? "warning"
              : "success"
        }
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Green &lt;50% · Amber 50-65% · Red &gt;65%
      </p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <LabelValue label="DBR" value={`${incomeAssessment.dbr}%`} />
      <LabelValue
        label="Net surplus after EMIs"
        value={
          <span className={incomeAssessment.netSurplus >= 0 ? "text-success" : "text-destructive"}>
            {inr(incomeAssessment.netSurplus)}
          </span>
        }
      />
    </div>
  </div>
</Collapsible>
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/components/copilot-review.tsx` — import `calculateIncome`, call it, add Income & Affordability section

## Done when

- `npx tsc --noEmit` exits clean
- `calculateIncome(app)` is called inside the `CopilotReview` component
- New "Income & Affordability (Engine)" Collapsible section renders
- Shows: Declared vs Verified income, variance flag, net monthly income, EMI totals
- FOIR displayed with `MeterBar` — green <50%, amber 50-65%, red >65%
- DBR percentage and net surplus shown
- Net surplus is green when positive, red when negative
- Existing "Obligations & FOIR" section still present (the new section supplements it with engine-calculated values)
- No `// # reason:` or `// Self-review` comments in any edited file
