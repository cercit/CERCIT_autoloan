---
type: new
target: src/components/cashflow-summary-card.tsx
model: deepseek
context: src/lib/format.ts
---

## Instructions

Create a React card component displaying bank statement cash flow analysis results.

Requirements:
- Named export `CashflowSummaryCard`
- Props interface `CashflowSummaryCardProps`:
  - `totalCredits: number`
  - `totalDebits: number`
  - `avgMonthlyBalance: number`
  - `avgSalary: number`
  - `salaryRegularity: "regular" | "irregular" | "none"`
  - `bounceCount: number`
  - `totalEmiBurden: number`
  - `cashWithdrawalRatio: number`
  - `monthCount: number`
  - `className?: string`
- Layout: a card with a header "Cash flow analysis" and a subtitle showing the month count (e.g. "Based on 6 months of transactions")
- Show a 2-column grid of metric rows:
  - "Avg monthly balance" — value in INR
  - "Avg salary credit" — value in INR
  - "Salary regularity" — colored badge: green "Regular", yellow "Irregular", red "None"
  - "Total EMI burden" — value in INR per month
  - "EMI bounces" — count, green if 0, red if > 0
  - "Cash withdrawal ratio" — percentage, red if > 40%
- Below the grid: a simple inflow/outflow summary bar. Green bar for credits, red bar for debits, proportional width. Show amounts below each bar.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` utility class for container
