---
type: new
target: src/lib/salary-slip-parser.ts
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a parser module that extracts structured salary data from raw text (already extracted from a PDF).

Requirements:
- Named export type `SalarySlipData`:
  - `employerName: string | null`
  - `employeeName: string | null`
  - `month: string | null` — e.g. "Aug 2026"
  - `grossSalary: number | null`
  - `basicSalary: number | null`
  - `hra: number | null`
  - `deductions: number | null`
  - `pf: number | null`
  - `tax: number | null`
  - `netSalary: number | null`
  - `confidence: "high" | "medium" | "low"`
- Named export `parseSalarySlip(text: string): SalarySlipData`
- Use regex patterns to find common salary slip keywords and nearby numbers:
  - "gross" / "gross salary" / "gross pay" followed by a number
  - "basic" / "basic salary" followed by a number
  - "hra" / "house rent" followed by a number
  - "deduction" / "total deductions" followed by a number
  - "pf" / "provident fund" / "epf" followed by a number
  - "tax" / "tds" / "income tax" followed by a number
  - "net" / "net salary" / "net pay" / "take home" followed by a number
  - Month/year patterns like "August 2026", "Aug-26", "08/2026"
- Number extraction: handle Indian format (1,23,456.00) and plain numbers
- Named export `extractIndianNumber(text: string): number | null` — parse a string like "1,23,456.00" or "123456" into a number
- Set confidence to "high" if gross + net both found, "medium" if only net found, "low" if neither
- Pure TypeScript, no external dependencies, no React
