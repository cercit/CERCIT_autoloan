---
type: new
target: src/components/scheme-card.tsx
model: deepseek
---

## Instructions

Create a loan scheme comparison card for displaying available vehicle finance schemes.

Requirements:
- Named export `SchemeCard`
- Export the props type as `SchemeCardProps`:
  - `name: string` — scheme name (e.g. "Fast Track Car Loan")
  - `rate: { min: number; max: number }` — interest rate range
  - `tenure: { min: number; max: number }` — tenure range in months
  - `maxLtv: number` — max LTV percentage
  - `maxFoir: number` — max FOIR percentage
  - `minCibil: number` — minimum CIBIL score
  - `processing: number` — processing fee percentage
  - `active?: boolean` — whether this scheme is currently selected/active
  - `onClick?: () => void`
- Layout: a panel div with border. When `active`, add a ring-2 ring-primary border.
- Top: scheme name as font-semibold text
- Grid below (2 columns on sm, 3 on md) showing each parameter:
  - Rate: show as "8.99% – 11.5%"
  - Tenure: show as "12 – 84 months"
  - Max LTV: show as "85%"
  - Max FOIR: show as "55%"
  - Min CIBIL: show as "700"
  - Processing: show as "0.5%"
- Each grid cell: label in text-xs text-muted-foreground, value in text-sm font-medium
- Import `cn` from `@/lib/utils`
- Wrapper classes: `panel rounded-xl p-4 cursor-pointer transition-shadow hover:shadow-md`
- When `onClick` is provided, the div should be clickable (attach onClick)
