---
type: new
target: src/lib/cam-data-assembler.ts
model: deepseek
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module that assembles all appraisal data into a single CAM (Credit Appraisal Memo) data structure.

Requirements:
- Named export type `CAMData`:
  - `applicationId: string`
  - `generatedAt: string` — ISO timestamp
  - `applicant`:
    - `name: string`
    - `age: number`
    - `pan: string`
    - `aadhaarMasked: string`
    - `employer: string`
    - `employerCategory: "A" | "B" | "C" | "unverified"`
    - `designation: string`
    - `grossMonthlyIncome: number`
    - `netMonthlyIncome: number`
  - `vehicle`:
    - `make: string`
    - `model: string`
    - `variant: string`
    - `segment: string`
    - `exShowroomPrice: number`
    - `onRoadPrice: number`
    - `dealerName: string`
    - `dealerTier: string`
  - `loan`:
    - `amount: number`
    - `tenure: number`
    - `rate: number`
    - `emi: number`
    - `processingFee: number`
  - `bureau`:
    - `source: string`
    - `score: number`
    - `band: string`
    - `flags: string[]`
  - `cashflow`:
    - `avgBalance: number`
    - `avgSalary: number`
    - `salaryRegularity: string`
    - `bounceCount: number`
    - `monthsAnalyzed: number`
  - `ratios`:
    - `foirPct: number`
    - `dbrPct: number`
    - `ltvPct: number`
    - `netSurplus: number`
  - `policyResult`:
    - `decision: string`
    - `score: number`
    - `band: string`
    - `failedRules: Array<{id: string; description: string; severity: string}>`
  - `recommendation: string` — generated text summary
- Named export `assembleCAM(parts: {applicant: any; vehicle: any; loan: any; bureau: any; cashflow: any; ratios: any; policyResult: any}): CAMData`
  - Merge all parts into the CAMData structure
  - Generate `applicationId` as "APP-" + current date YYYYMMDD + "-" + random 4 hex chars
  - Set `generatedAt` to current ISO timestamp
  - Generate `recommendation` string based on policyResult.decision:
    - approve: "Application meets all policy criteria. Bureau score {score} ({band}), FOIR {foir}%, LTV {ltv}%. Recommended for approval."
    - review: "Application requires manual review. {N} policy flags raised: {list of failed rule descriptions}."
    - decline: "Application does not meet minimum criteria. Hard failures: {list}."
- Import `inr` and `pct` from `@/lib/format`
- Pure TypeScript, no React
