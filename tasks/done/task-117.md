---
type: new
target: src/components/policy-verdict-card.tsx
model: deepseek
context: src/lib/format.ts
---

## Instructions

Create a React card component showing the policy engine decision with rule-by-rule breakdown.

Requirements:
- Named export `PolicyVerdictCard`
- Props interface `PolicyVerdictCardProps`:
  - `decision: "approve" | "review" | "decline"`
  - `band: "green" | "amber-high" | "amber-low" | "red"`
  - `score: number` — 0-100
  - `passedRules: Array<{id: string; description: string}>`
  - `failedRules: Array<{id: string; description: string; severity: "hard" | "soft"}>`
  - `className?: string`
- Layout:
  - Header: large decision text — "Approved" (green bg), "Needs Review" (yellow bg), "Declined" (red bg). Score badge next to it showing "Score: 85/100".
  - Band indicator: a colored strip along the top of the card matching the band.
  - Rule breakdown in two sections:
    - "Passed checks" — a list with green check icons, showing rule description. Collapsed by default if more than 5, with a "Show all" toggle.
    - "Failed checks" — a list with red X icons for hard failures and orange warning icons for soft failures. Show severity as a small label ("Hard block" / "Review flag"). Always expanded.
  - Summary footer: "X of Y policy rules passed"
- Import `cn` from `@/lib/utils`
- Use `panel` class
- Use `useState` for the collapsed/expanded toggle
