---
type: new
target: src/lib/risk-score-model.ts
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module implementing a logistic-regression-style risk scoring model for credit applications.

Requirements:
- Named export type `RiskFeatures`:
  - `bureauScore: number` — normalized 0-1 (300=0, 900=1)
  - `foirPct: number` — 0-100
  - `ltvPct: number` — 0-100
  - `dpd90Count: number`
  - `dpd30Count: number`
  - `bounceCount: number`
  - `salaryRegularity: number` — 1 for regular, 0.5 for irregular, 0 for none
  - `employerTier: number` — A=1, B=0.7, C=0.4, unverified=0.1
  - `enquiryVelocity: number` — enquiries in 90 days
  - `cashWithdrawalRatio: number` — 0-100
  - `tenure: number` — months
  - `applicantAge: number`
- Named export type `RiskScoreResult`:
  - `probability: number` — 0-1 probability of default
  - `score: number` — 0-1000 internal score (higher = safer)
  - `grade: "A" | "B" | "C" | "D" | "E"`
  - `featureContributions: Array<{feature: string; weight: number; contribution: number}>` — explainability
- Named export `FEATURE_WEIGHTS: Record<string, number>` — hardcoded weights simulating a trained model:
  - bureauScore: -3.5 (higher score = lower default risk, so negative weight)
  - foirPct: 0.04
  - ltvPct: 0.02
  - dpd90Count: 1.8
  - dpd30Count: 0.6
  - bounceCount: 0.5
  - salaryRegularity: -1.2
  - employerTier: -0.8
  - enquiryVelocity: 0.15
  - cashWithdrawalRatio: 0.02
  - tenure: 0.005
  - applicantAge: -0.01
  - intercept: 1.5
- Named export `computeRiskScore(features: RiskFeatures): RiskScoreResult`
  - Normalize bureauScore: (raw - 300) / 600
  - Compute logit = intercept + sum(weight_i * feature_i)
  - probability = 1 / (1 + exp(-logit)) — sigmoid
  - score = Math.round((1 - probability) * 1000)
  - grade: A if score >= 800, B if >= 650, C if >= 500, D if >= 350, E below 350
  - featureContributions: for each feature, compute weight * value, sort by absolute contribution descending
- Named export `normalizeFeatures(raw: {bureauScore: number; foirPct: number; ltvPct: number; dpd90Count: number; dpd30Count: number; bounceCount: number; salaryRegularity: string; employerCategory: string; enquiries90d: number; cashWithdrawalRatio: number; tenure: number; applicantAge: number}): RiskFeatures`
  - Converts string categories to numeric values
- Pure TypeScript, no external dependencies
