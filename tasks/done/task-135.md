---
type: new
target: src/lib/scheme-eligibility.ts
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module that checks which loan schemes/products an applicant qualifies for based on their profile.

Requirements:
- Named export type `Scheme`:
  - `id: string`
  - `name: string` — e.g. "Standard Car Loan", "Premium Car Loan", "First-Time Buyer", "OEM Subvention"
  - `vehicleSegments: string[]` — which segments the scheme covers
  - `minBureauScore: number`
  - `maxFOIR: number`
  - `maxLTV: number`
  - `minIncome: number` — monthly gross
  - `maxTenure: number` — months
  - `rateRange: {min: number; max: number}`
  - `processingFeePct: number`
  - `employerCategories: string[]` — ["A", "B", "C"] or ["A", "B"] etc.
  - `specialConditions: string | null`
- Named export type `EligibilityResult`:
  - `scheme: Scheme`
  - `eligible: boolean`
  - `failedCriteria: string[]` — e.g. ["Bureau score 680 below minimum 700", "FOIR 55% exceeds limit 50%"]
  - `matchScore: number` — 0-100, how well the applicant fits
- Named export `DEFAULT_SCHEMES: Scheme[]` — 5 schemes:
  - "standard-car": Standard Car Loan — all segments, bureau 650+, FOIR 60%, LTV 90%, income 25000+, 84mo, 9.5-12%, 1% fee, all employers
  - "premium-car": Premium Car Loan — car/suv, bureau 750+, FOIR 50%, LTV 85%, income 50000+, 84mo, 8.49-9.99%, 0.5% fee, A/B employers
  - "first-time": First-Time Buyer — car/suv, bureau 700+, FOIR 55%, LTV 90%, income 30000+, 60mo, 9.99-11%, 0.75% fee, all employers, special: "No existing auto loan"
  - "oem-subvention": OEM Subvention — car/suv, bureau 700+, FOIR 50%, LTV 85%, income 40000+, 60mo, 7.99-8.99%, 0% fee, A/B employers, special: "Applicable OEM tie-up required"
  - "commercial-vehicle": CV Loan — lcv/scv/3w, bureau 650+, FOIR 65%, LTV 80%, income 20000+, 60mo, 10.5-13%, 1.5% fee, all employers
- Named export `checkEligibility(applicant: {bureauScore: number; foirPct: number; ltvPct: number; grossIncome: number; tenure: number; vehicleSegment: string; employerCategory: string; hasExistingAutoLoan: boolean}, schemes?: Scheme[]): EligibilityResult[]`
  - Check each scheme against the applicant profile
  - Build failedCriteria list for each scheme
  - matchScore: start at 100, subtract 20 per failed criterion
- Import `inr` from `@/lib/format` for formatting in failedCriteria strings
- No other deps
