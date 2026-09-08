---
type: new
target: src/components/rate-card-picker.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component for selecting and comparing interest rate options based on the applicant's risk profile.

Requirements:
- Named export `RateCardPicker`
- Props interface `RateCardPickerProps`:
  - `riskGrade: "A" | "B" | "C" | "D" | "E"`
  - `loanAmount: number`
  - `tenure: number` — months
  - `options: Array<{label: string; rate: number; processingFeePct: number; preApproved?: boolean}>`
  - `selectedIndex: number | null`
  - `onSelect?: (index: number) => void`
  - `className?: string`
- If options array is empty, generate default options based on riskGrade:
  - A: [{label: "Best rate", rate: 8.49, processingFeePct: 0.5, preApproved: true}, {label: "Standard", rate: 8.99, processingFeePct: 0.25}]
  - B: [{label: "Best rate", rate: 9.49, processingFeePct: 0.5}, {label: "Standard", rate: 9.99, processingFeePct: 0.25}]
  - C: [{label: "Standard", rate: 10.99, processingFeePct: 1.0}, {label: "Extended", rate: 11.49, processingFeePct: 0.75}]
  - D: [{label: "Standard", rate: 12.99, processingFeePct: 1.0}]
  - E: empty (no offers)
- Layout: horizontal cards, one per option. Each card shows:
  - Label at top (e.g. "Best rate"). If preApproved, show a small green "Pre-approved" badge.
  - Rate displayed large: "8.49% p.a."
  - Calculated EMI using the formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1) where r = annual rate / 12 / 100, n = tenure. Show as "EMI: INR X/mo".
  - Processing fee: "Processing fee: 0.5% (INR X)"
  - Total interest payable: (EMI * tenure) - loanAmount, shown as "Total interest: INR X"
  - Selected state: colored border (primary blue), subtle background tint.
  - Clickable cards — call onSelect(index) on click.
- If riskGrade is "E" and no options, show a message: "No rate offers available for this risk profile."
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
