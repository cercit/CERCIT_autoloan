---
type: new
target: src/components/collateral-summary.tsx
model: deepseek
---

## Instructions

Create a card component displaying vehicle collateral details for the credit appraisal.

Requirements:
- Named export `CollateralSummary`
- Props interface `CollateralSummaryProps`:
  - `exShowroom: number`
  - `onRoad: number`
  - `loanAmount: number`
  - `insuranceValue?: number`
  - `vehicleMake: string`
  - `vehicleModel: string`
  - `className?: string`
- Calculate and display:
  - LTV (Loan to Value): `(loanAmount / exShowroom) * 100`, shown as percentage
  - Margin money: `onRoad - loanAmount`, formatted as INR
  - Margin %: `((onRoad - loanAmount) / onRoad) * 100`
- LTV color coding: green if <= 80%, yellow if 80-85%, red if > 85%
- Show a simple horizontal bar visualization for LTV — a gray track with a colored fill bar proportional to the LTV percentage, capped at 100%
- Below the bar: vehicle make/model and insurance value (if provided)
- Import `inr`, `pct` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` utility class, `tabular-nums` on numbers
