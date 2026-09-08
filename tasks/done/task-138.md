---
type: new
target: src/lib/agreement-generator.ts
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module that generates loan agreement text from application data.

Requirements:
- Named export type `AgreementInput`:
  - `applicantName: string`
  - `applicantAddress: string`
  - `applicantPan: string`
  - `lenderName: string` — default "cercit Financial Services"
  - `loanAmount: number`
  - `tenure: number` — months
  - `interestRate: number`
  - `emi: number`
  - `processingFee: number`
  - `vehicleMake: string`
  - `vehicleModel: string`
  - `vehicleVariant: string`
  - `dealerName: string`
  - `disbursalDate: string` — ISO date
- Named export type `AgreementOutput`:
  - `title: string`
  - `date: string`
  - `referenceNumber: string`
  - `clauses: Array<{heading: string; text: string}>`
  - `fullText: string` — all clauses concatenated with formatting
- Named export `generateAgreement(input: AgreementInput): AgreementOutput`
  - Generate a reference number: "AGR-" + YYYYMMDD + "-" + random 6 hex chars
  - Generate 10 standard clauses:
    1. "Loan details" — amount, tenure, rate, EMI
    2. "Vehicle details" — make, model, variant, dealer
    3. "Disbursement" — amount disbursed to dealer account on disbursalDate
    4. "Repayment" — EMI amount, due on 5th of each month, via NACH auto-debit
    5. "Processing fee" — amount and when deducted
    6. "Prepayment" — allowed after 6 months, 2% prepayment charge on outstanding
    7. "Default and penalties" — 2% per month penal interest on overdue EMI, 18% penalty on bounced NACH
    8. "Insurance" — vehicle insurance mandatory for entire loan tenure, comprehensive cover first year
    9. "Hypothecation" — vehicle hypothecated to lender until loan closure, RC will reflect charge
    10. "Jurisdiction" — disputes subject to courts at lender's registered office location
  - Each clause text should include the actual values from the input (loan amount in INR, vehicle details, etc.)
  - fullText: concatenate all clauses with headers as "1. Loan details\n\n{text}\n\n2. Vehicle details\n\n{text}\n\n..."
- Import `inr` from `@/lib/format`
- No other deps
