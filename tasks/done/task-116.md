---
type: new
target: src/components/foir-gauge.tsx
model: gemini-flash
context: src/lib/format.ts
---

## Instructions

Create a React component that visualizes FOIR and eligibility as an interactive gauge.

Requirements:
- Named export `FOIRGauge`
- Props interface `FOIRGaugeProps`:
  - `grossIncome: number`
  - `existingEMIs: number`
  - `proposedEMI: number`
  - `otherObligations: number`
  - `foirPct: number`
  - `threshold: number` — e.g. 50
  - `verdict: "pass" | "marginal" | "fail"`
  - `netSurplus: number`
  - `maxEligibleEMI: number`
  - `className?: string`
- Layout:
  - A semicircular SVG gauge (half-circle arc from left to right). Fill color transitions: green 0-40%, yellow 40-50%, orange 50-60%, red 60%+.
  - Needle pointing to the current FOIR percentage.
  - Center of the gauge shows the FOIR value as large text (e.g. "42%") with the verdict label below ("Within limit" / "Marginal" / "Exceeds limit").
  - Below the gauge: a stacked horizontal bar showing income breakdown:
    - Green segment: net surplus
    - Blue segments: existing EMIs
    - Purple segment: proposed EMI
    - Gray segment: other obligations
    - Show INR amounts under each segment
  - Bottom line: "Max eligible EMI: INR X" in bold.
- SVG gauge should use `viewBox` for responsive sizing.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class for the outer container
