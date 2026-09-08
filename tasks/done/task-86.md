---
type: new
target: src/components/foir-calculator.tsx
model: deepseek-r1
---

## Instructions

Create an interactive FOIR (Fixed Obligation to Income Ratio) calculator component.

Requirements:
- Named export `FoirCalculator`
- Props (export as `FoirCalculatorProps`):
  - `netIncome?: number` — pre-filled monthly net income
  - `existingObligations?: number` — pre-filled total existing EMIs
  - `proposedEmi?: number` — pre-filled proposed loan EMI
  - `onChange?: (foir: number) => void` — callback when FOIR changes
- State: three numeric inputs for netIncome, existingObligations, proposedEmi (use React useState, initialize from props or 0)
- FOIR formula: `((existingObligations + proposedEmi) / netIncome) * 100` — show as percentage with 1 decimal
- Layout:
  - Three labeled Input fields (from `@/components/ui/input`), each with a Label (from `@/components/ui/label`)
  - Below the inputs: a result section showing:
    - "Total obligations: Rs X" (existing + proposed, formatted with `inr` from `@/lib/format`)
    - "FOIR: X.X%" in large bold text
    - Color the FOIR value: green if <=50, amber/yellow-600 if <=60, red if >60
  - Below that: a simple horizontal bar showing the ratio visually — a div with bg-muted as track, inner div with the FOIR % as width (capped at 100%), colored same as the text
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Call `onChange` via useEffect whenever FOIR changes (only if onChange is provided)
- Wrapper: `div` with `panel rounded-xl p-5 space-y-4`
- Handle edge cases: if netIncome is 0 or NaN, show FOIR as "—" instead of Infinity
