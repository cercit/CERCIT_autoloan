---
type: new
target: src/components/transaction-table.tsx
model: qwen-coder
context: src/lib/format.ts
---

## Instructions

Create a React table component showing categorized bank transactions with filtering.

Requirements:
- Named export `TransactionTable`
- Props interface `TransactionTableProps`:
  - `transactions: Array<{date: string; description: string; debit: number | null; credit: number | null; balance: number | null; category: string}>`
  - `className?: string`
- Render a table with columns: Date, Description, Debit, Credit, Balance, Category
- Category column shows a small colored pill badge:
  - salary = green, emi = blue, upi = purple, card = indigo, cash = orange, bounce = red, transfer = gray, interest = teal, other = gray
- Above the table: a row of small filter pill buttons, one per category that exists in the data. Clicking one toggles that category on/off. Show count next to each category name. "All" button to reset.
- Date column formatted as "01 Aug 2026" (use toLocaleDateString with en-IN options)
- Debit and credit columns: show INR formatted amounts, debit in red text, credit in green text, null cells empty
- Balance column: right-aligned, tabular-nums
- Table wrapper has `overflow-x-auto` for mobile scrolling
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `useState` from React for the filter state
- No external dependencies beyond React
