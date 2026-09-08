---
type: new
target: src/lib/ltv-calculator.ts
model: gemini-flash
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module for Loan-to-Value (LTV) ratio calculations for new vehicle finance.

Requirements:
- Named export type `LTVInput`:
  - `exShowroomPrice: number`
  - `onRoadPrice: number`
  - `loanAmount: number`
  - `vehicleSegment: "car" | "suv" | "lcv" | "scv" | "3w"`
  - `isNewVehicle: boolean` — always true for Phase 1
- Named export type `LTVResult`:
  - `ltvOnExShowroom: number` — loan / ex-showroom * 100
  - `ltvOnOnRoad: number` — loan / on-road * 100
  - `maxAllowedLTV: number` — based on segment
  - `marginMoney: number` — on-road minus loan
  - `marginMoneyPct: number` — margin / on-road * 100
  - `verdict: "within_limit" | "exceeds_limit"`
  - `maxLoanAllowed: number` — max LTV * on-road / 100
  - `shortfall: number` — how much loan exceeds max allowed (0 if within limit)
- Named export `calculateLTV(input: LTVInput): LTVResult`
  - Max LTV by segment: car = 90%, suv = 85%, lcv = 85%, scv = 80%, 3w = 75%
  - Verdict: within_limit if ltvOnOnRoad <= maxAllowedLTV
- Named export `LTV_LIMITS: Record<string, number>` — the segment-to-max-LTV mapping
- Pure TypeScript, no external dependencies
