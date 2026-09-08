---
type: new
target: src/components/repayment-progress.tsx
model: inkling
---

## Instructions

Create a visual progress component showing loan repayment status.

Requirements:
- Named export `RepaymentProgress`
- Props interface `RepaymentProgressProps`:
  - `totalEmis: number` — total EMI count (tenure in months)
  - `paidEmis: number` — number of EMIs already paid
  - `emiAmount: number` — monthly EMI amount
  - `totalPrincipal: number` — original loan amount
  - `principalPaid: number` — principal repaid so far
  - `className?: string`
- Show a circular progress ring (SVG, 120x120 viewBox):
  - Background circle in muted gray
  - Foreground arc in primary blue, proportional to `paidEmis / totalEmis`
  - Center text: percentage paid (e.g. "34%") in large bold, "completed" in small muted text below
- Below the ring, show a 2x2 grid of stats:
  - "EMIs paid" — `paidEmis` / `totalEmis`
  - "EMIs remaining" — `totalEmis - paidEmis`
  - "Principal paid" — formatted as INR
  - "Outstanding" — `totalPrincipal - principalPaid` formatted as INR
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `stroke-dasharray` and `stroke-dashoffset` for the SVG arc
- Use `tabular-nums` on all numeric values
