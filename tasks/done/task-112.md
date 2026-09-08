---
type: new
target: src/lib/foir-calculator.ts
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module for Fixed Obligation to Income Ratio (FOIR) and Debt Burden Ratio (DBR) calculations used in credit appraisal.

Requirements:
- Named export type `FOIRInput`:
  - `grossMonthlyIncome: number`
  - `existingEMIs: number[]` — array of current EMI amounts
  - `proposedEMI: number`
  - `creditCardMinDue: number` — minimum due on credit cards (default 0)
  - `otherObligations: number` — any other monthly obligations (default 0)
- Named export type `FOIRResult`:
  - `totalObligations: number` — sum of all existing + proposed
  - `foirPct: number` — FOIR as percentage (obligations / gross income * 100)
  - `dbrPct: number` — DBR as percentage (total EMIs only / net income * 100, where net = gross * 0.7 approx)
  - `netSurplus: number` — gross income minus total obligations
  - `verdict: "pass" | "marginal" | "fail"`
  - `maxEligibleEMI: number` — maximum EMI the applicant can afford at the threshold
  - `reason: string` — human-readable explanation
- Named export `calculateFOIR(input: FOIRInput, threshold?: number): FOIRResult`
  - Default threshold: 50% (FOIR must be <= 50% to pass)
  - Marginal: 50-60%
  - Fail: above 60%
  - maxEligibleEMI: (threshold/100 * grossMonthlyIncome) - existingObligations
  - reason: e.g. "FOIR 42% — within 50% limit, net surplus 35,000/month" or "FOIR 58% — exceeds 50% limit by 8%, reduce loan amount or tenure"
- Named export `calculateDBR(grossIncome: number, totalEMIs: number): number` — returns DBR percentage using net = gross * 0.7
- Import `inr` from `@/lib/format` for the reason string
- No external dependencies
