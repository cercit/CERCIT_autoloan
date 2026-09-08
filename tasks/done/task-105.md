---
type: new
target: src/lib/bank-statement-parser.ts
model: gemini-flash
---

## Instructions

Create a module that parses raw bank statement text into structured transaction data.

Requirements:
- Named export type `Transaction`:
  - `date: string` — ISO date string (YYYY-MM-DD)
  - `description: string` — narration/description text
  - `debit: number | null` — amount debited (null if credit)
  - `credit: number | null` — amount credited (null if debit)
  - `balance: number | null` — running balance if available
  - `raw: string` — the original text line
- Named export type `BankStatementData`:
  - `accountNumber: string | null`
  - `accountHolder: string | null`
  - `bankName: string | null`
  - `periodFrom: string | null` — ISO date
  - `periodTo: string | null` — ISO date
  - `transactions: Transaction[]`
  - `openingBalance: number | null`
  - `closingBalance: number | null`
- Named export `parseBankStatement(text: string): BankStatementData`
  - Parse line by line looking for transaction rows
  - Date patterns: "01/08/2026", "01-Aug-2026", "2026-08-01", "01 Aug 2026"
  - Amount patterns: Indian format numbers with optional "Dr"/"Cr" suffix
  - Look for account number pattern (10-18 digits) near the top
  - Look for bank name keywords: "State Bank", "HDFC", "ICICI", "Axis", "Kotak", "PNB", etc.
  - Look for period/statement date near the top
- Named export `parseIndianDate(text: string): string | null` — returns ISO date or null
- Pure TypeScript, no external dependencies
