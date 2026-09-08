---
type: new
target: src/lib/transaction-categorizer.ts
model: gemini-flash
---

## Instructions

Create a module that categorizes bank transactions by type using keyword matching.

Requirements:
- Named export type `CategorizedTransaction` extends the base transaction shape:
  - `date: string`
  - `description: string`
  - `debit: number | null`
  - `credit: number | null`
  - `balance: number | null`
  - `category: TransactionCategory`
- Named export type `TransactionCategory`:
  - `"salary"` — salary credits (keywords: "salary", "sal cr", "payroll", "neft-sal")
  - `"emi"` — loan EMI debits (keywords: "emi", "loan", "equated monthly", "nach", "auto debit")
  - `"upi"` — UPI payments (keywords: "upi", "upi/")
  - `"card"` — card transactions (keywords: "pos", "card", "visa", "mastercard", "rupay")
  - `"cash"` — cash withdrawals/deposits (keywords: "atm", "cash", "withdrawal", "cdm")
  - `"transfer"` — NEFT/RTGS/IMPS (keywords: "neft", "rtgs", "imps" but not salary)
  - `"bounce"` — bounced/returned transactions (keywords: "bounce", "return", "unpaid", "dishon", "insufficient")
  - `"interest"` — interest credit/debit (keywords: "interest", "int cr", "int dr")
  - `"other"` — anything that doesn't match
- Named export `categorizeTransaction(description: string, debit: number | null, credit: number | null): TransactionCategory`
  - Match keywords case-insensitively against the description
  - Salary must be a credit (not a debit)
  - EMI must be a debit
  - Bounce check applies to both
  - Return first matching category in priority order: bounce > salary > emi > upi > card > cash > transfer > interest > other
- Named export `categorizeAll(transactions: Array<{date: string; description: string; debit: number | null; credit: number | null; balance: number | null}>): CategorizedTransaction[]`
- Pure TypeScript, no dependencies
