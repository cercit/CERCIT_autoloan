---
type: new
target: src/lib/cashflow-analyzer.ts
model: deepseek
context: src/lib/format.ts
---

## Instructions

Create a module that computes cash flow metrics from categorized bank transactions.

Requirements:
- Named export type `CashflowSummary`:
  - `totalCredits: number`
  - `totalDebits: number`
  - `netFlow: number` — credits minus debits
  - `avgMonthlyBalance: number`
  - `minBalance: number`
  - `maxBalance: number`
  - `salaryCredits: number[]` — array of salary credit amounts found
  - `avgSalary: number`
  - `salaryRegularity: "regular" | "irregular" | "none"` — regular if salary found in 5+ of 6 months, irregular if 2-4, none if < 2
  - `emiDebits: number[]` — array of EMI debit amounts
  - `totalEmiBurden: number` — sum of unique monthly EMI amounts
  - `bounceCount: number`
  - `bounceMonths: string[]` — months where bounces occurred (e.g. ["2026-03", "2026-05"])
  - `cashWithdrawalRatio: number` — cash withdrawals as percentage of total debits
  - `monthCount: number` — number of distinct months in the data
- Named export `analyzeCashflow(transactions: Array<{date: string; debit: number | null; credit: number | null; balance: number | null; category: string}>): CashflowSummary`
  - Group transactions by month (YYYY-MM from date)
  - Sum credits and debits
  - Calculate average of non-null balance values for avgMonthlyBalance
  - Find min and max of non-null balance values
  - Collect all transactions where category is "salary" — their credit amounts go into salaryCredits
  - avgSalary is the average of salaryCredits, or 0 if empty
  - Collect all transactions where category is "emi" — their debit amounts go into emiDebits
  - bounceCount is the count of transactions where category is "bounce"
  - cashWithdrawalRatio: sum of debits where category is "cash" divided by totalDebits times 100
- Pure TypeScript, no external dependencies
