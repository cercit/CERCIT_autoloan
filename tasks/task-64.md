# Task 64 — Income comparison display component

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create a component that displays the cross-document income validation results (from task 63) as a comparison table with variance flags. Add it to the copilot review section of the application detail page.

## Current state

- `src/lib/engine.ts` exports `validateIncomeAcrossDocuments`, `ExtractedIncome`, and `IncomeValidationResult` (from task 63)
- `src/components/copilot-review.tsx` has Collapsible sections for Income and LTV
- `src/components/app-shell.tsx` exports `SectionCard`, `LabelValue`
- `src/components/status.tsx` exports `Pill` with tone support
- `src/lib/format.ts` exports `inr()` for currency formatting

## Steps

### 1. Create `src/components/income-comparison.tsx`

Build a component that:
- Takes `incomes: ExtractedIncome[]` as a prop
- Calls `validateIncomeAcrossDocuments(incomes)` internally
- Renders a table with columns: Source, Monthly Gross, Annual Gross, Monthly Net
- Below the table, shows the validation result:
  - If passed: green `Pill` with "Income consistent"
  - If failed: red `Pill` with "Variance detected" and a list of flags
- Use `inr()` to format all currency values
- Use `cn()` for conditional styling

Run `npx tsc --noEmit`.

### 2. Add `<IncomeComparison>` to `src/components/copilot-review.tsx`

Import `IncomeComparison` and render it inside a new `Collapsible` section titled "Cross-Document Income Check" after the LTV Assessment section.

For mock data (when no real extracted incomes exist), create a small inline array:

```typescript
const extractedIncomes: ExtractedIncome[] = [
  { source: "salary_slip", monthlyGross: app.grossIncome, annualGross: app.grossIncome * 12, monthlyNet: app.netIncome },
  { source: "bank_statement", monthlyGross: app.grossIncome * 0.98, annualGross: app.grossIncome * 12 * 0.98, monthlyNet: app.netIncome * 0.98 },
];
```

Pass this array to `<IncomeComparison>`.

Run `npx tsc --noEmit`.

## Files to edit

- `src/components/income-comparison.tsx` — new file
- `src/components/copilot-review.tsx` — import and render inside a Collapsible section

## Done when

- `npx tsc --noEmit` exits clean
- Income comparison table renders with Source, Monthly Gross, Annual Gross, Monthly Net columns
- Currency values formatted with `inr()`
- Green pill when variance is within threshold, red pill with flag list when exceeded
- New Collapsible section appears in copilot review
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new data field resolves from its source, not a hardcoded fallback
