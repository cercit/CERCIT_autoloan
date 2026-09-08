---
type: new
target: src/components/income-summary-card.tsx
model: gemini-flash
---

## Instructions

Create a card component displaying an applicant's income breakdown.

Requirements:
- Named export `IncomeSummaryCard`
- Props interface `IncomeSummaryCardProps`:
  - `grossSalary: number`
  - `deductions: number`
  - `netSalary: number`
  - `otherIncome?: number` — defaults to 0
  - `existingEmis: number`
  - `proposedEmi: number`
  - `className?: string`
- Show a vertical list of labeled rows with values right-aligned:
  - Gross salary
  - (-) Deductions
  - Net salary (bold, with a thin top border as separator)
  - (+) Other income (only if > 0)
  - Total income (bold)
  - (-) Existing EMIs
  - (-) Proposed EMI
  - Net surplus (bold, with a top border separator, colored green if positive, red if negative or zero)
- Calculate FOIR: `(existingEmis + proposedEmi) / (netSalary + (otherIncome ?? 0)) * 100` and show as a small badge below the surplus, e.g. "FOIR: 42.3%"
- FOIR badge color: green if < 40, yellow if 40-50, orange if 50-60, red if >= 60
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` utility class, `tabular-nums` on all amounts
