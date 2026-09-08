---
type: new
target: src/lib/policy-rule-engine.ts
model: deepseek
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module implementing a deterministic policy rule engine for credit decisioning.

Requirements:
- Named export type `PolicyInput`:
  - `applicantAge: number`
  - `bureauScore: number`
  - `foirPct: number`
  - `ltvPct: number`
  - `dpd90Count: number`
  - `dpd30Count: number`
  - `bounceCount: number` — EMI bounces in bank statement
  - `salaryRegularity: "regular" | "irregular" | "none"`
  - `employerCategory: "A" | "B" | "C" | "unverified"`
  - `loanAmount: number`
  - `tenure: number` — months
  - `vehicleSegment: string`
- Named export type `PolicyRule`:
  - `id: string` — e.g. "AGE_MIN", "BUREAU_FLOOR"
  - `description: string`
  - `check: (input: PolicyInput) => boolean` — returns true if rule passes
  - `severity: "hard" | "soft"` — hard = auto-reject, soft = flag for review
- Named export type `PolicyResult`:
  - `decision: "approve" | "review" | "decline"`
  - `passedRules: string[]` — IDs of passed rules
  - `failedRules: Array<{id: string; description: string; severity: "hard" | "soft"}>`
  - `score: number` — 0-100 composite score
  - `band: "green" | "amber-high" | "amber-low" | "red"`
- Named export `POLICY_RULES: PolicyRule[]` — the full rule set:
  - AGE_MIN: age >= 21 (hard)
  - AGE_MAX: age <= 60 (hard)
  - BUREAU_FLOOR: bureauScore >= 650 (hard)
  - BUREAU_GOOD: bureauScore >= 700 (soft)
  - FOIR_LIMIT: foirPct <= 60 (hard)
  - FOIR_OPTIMAL: foirPct <= 50 (soft)
  - LTV_LIMIT: ltvPct <= 90 (hard)
  - NO_SEVERE_DPD: dpd90Count === 0 (hard)
  - NO_RECENT_DPD: dpd30Count === 0 (soft)
  - LOW_BOUNCES: bounceCount <= 1 (soft)
  - SALARY_REGULAR: salaryRegularity === "regular" (soft)
  - EMPLOYER_VERIFIED: employerCategory !== "unverified" (soft)
- Named export `evaluatePolicy(input: PolicyInput): PolicyResult`
  - Run all rules. If any hard rule fails → decline.
  - If no hard failures and no soft failures → approve (green).
  - If no hard failures, 1-2 soft failures → approve with flags (amber-high).
  - If no hard failures, 3+ soft failures → review (amber-low).
  - Score: start at 100, subtract 25 for each hard fail, 10 for each soft fail, floor at 0.
- Pure TypeScript, no external dependencies
