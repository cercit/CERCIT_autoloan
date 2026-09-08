---
type: new
target: src/lib/bureau-api-mock.ts
---

## Instructions

Create a TypeScript module that simulates a bureau (CIBIL) API call, returning realistic mock responses.

Requirements:
- Named export type `BureauAPIRequest`:
  - `pan: string`
  - `name: string`
  - `dateOfBirth: string`
  - `bureau: "cibil" | "experian" | "crif"`
- Named export type `BureauAPIResponse`:
  - `success: boolean`
  - `requestId: string`
  - `timestamp: string`
  - `bureau: string`
  - `score: number`
  - `scoreRange: {min: number; max: number}`
  - `accounts: Array<{type: string; lender: string; sanctionedAmount: number; currentBalance: number; emi: number; dpd: number; status: "active" | "closed" | "written_off"}>`
  - `enquiries: Array<{date: string; lender: string; purpose: string; amount: number}>`
  - `totalActiveAccounts: number`
  - `totalClosedAccounts: number`
  - `oldestAccountAge: number` — months
  - `totalExposure: number`
  - `totalEMI: number`
  - `error?: string`
- Named export `async function fetchBureauReport(request: BureauAPIRequest): Promise<BureauAPIResponse>`
  - Simulate a 500-1500ms delay using setTimeout wrapped in a Promise
  - Generate a deterministic-ish score based on the PAN string (hash the characters to get a number in 550-850 range so the same PAN always returns the same score)
  - Generate 2-5 mock accounts: mix of home loan, personal loan, credit card, auto loan. Lenders from: SBI, HDFC, ICICI, Axis, Kotak, Bajaj Finance.
  - Generate 1-3 mock enquiries from the last 90 days.
  - 5% chance of returning success: false with error "Bureau service temporarily unavailable" to simulate failures.
- Named export `hashPanToScore(pan: string): number` — deterministic hash to score mapping
- Pure TypeScript, no deps
