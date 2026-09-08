---
type: new
target: src/components/loan-comparison-table.tsx
model: gemini-flash
---

## Instructions

Create a table component that compares multiple loan offers side by side.

Requirements:
- Named export `LoanComparisonTable`
- Type `LoanOffer`:
  - `id: string`
  - `label: string` — e.g. "Option A", "Recommended"
  - `amount: number`
  - `rate: number` — annual interest rate percentage
  - `tenure: number` — months
  - `emi: number`
  - `totalInterest: number`
  - `processingFee: number`
  - `recommended?: boolean`
- Props: `offers: LoanOffer[]`, optional `selectedId?: string`, optional `onSelect?: (id: string) => void`, optional `className?: string`
- Render a table where each column is one offer, rows are: Loan amount, Rate, Tenure, Monthly EMI, Total interest, Processing fee
- The recommended offer column should have a highlighted header (primary background)
- If `onSelect` is provided, show a "Select" button at the bottom of each column
- The selected column should have a subtle border highlight
- Import `inr`, `pct` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Table should scroll horizontally on mobile (`overflow-x-auto` wrapper)
- Use `tabular-nums` on all numeric cells
