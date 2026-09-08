---
type: new
target: src/components/emi-schedule.tsx
model: llama
---

## Instructions

Create an EMI amortization schedule table showing month-by-month loan repayment breakdown.

Requirements:
- Named export `EmiSchedule`
- Props (export as `EmiScheduleProps`):
  - `principal: number` — loan amount
  - `annualRate: number` — annual interest rate (e.g. 8.99)
  - `months: number` — tenure in months
  - `className?: string`
- Calculate the full amortization schedule:
  - Monthly rate = annualRate / 12 / 100
  - EMI = P * r * (1+r)^n / ((1+r)^n - 1), where P=principal, r=monthly rate, n=months
  - For each month: interest = outstanding * monthlyRate, principalPaid = emi - interest, closing = outstanding - principalPaid
  - Track: month number, opening balance, EMI, interest, principal paid, closing balance
- Show a summary bar above the table:
  - Total payment (EMI × months)
  - Total interest (total payment - principal)
  - Principal amount
  - Format all with `inr` from `@/lib/format`
- Table: use Table, TableBody, TableCell, TableHead, TableHeader, TableRow from `@/components/ui/table`
- Columns: Month | Opening | EMI | Interest | Principal | Closing
- Format all currency values with `inr` from `@/lib/format`
- Only show first 12 months by default. Add a Button (from `@/components/ui/button`) "Show all N months" / "Show less" toggle using useState
- Wrapper: div with `space-y-3` + spread className
- Use `font-variant-numeric: tabular-nums` on the table for aligned numbers (add className `tabular-nums`)
- Handle edge case: if annualRate is 0, do simple division (principal/months each month, zero interest)
