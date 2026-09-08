---
type: new
target: src/components/application-card.tsx
model: llama
---

## Instructions

Create a compact application summary card for displaying in list/grid views.

Requirements:
- Named export `ApplicationCard`
- Props (export as `ApplicationCardProps`):
  - `id: string`
  - `name: string`
  - `loanAmount: number`
  - `cibil: number`
  - `status: string`
  - `recommendation: "Approve" | "Maybe" | "Reject"`
  - `vehicle: string`
  - `submitted: string` — ISO date string
  - `onClick?: () => void`
  - `className?: string`
- Layout: a clickable panel card
  - Top row: applicant name (font-semibold text-sm) on left, recommendation Badge on right
    - Badge variant: "default" for Approve (add `bg-green-600` className), "secondary" for Maybe (add `bg-yellow-500 text-black`), "destructive" for Reject
  - Second row: application ID in text-xs text-muted-foreground, and status on the right
  - Third row: a 3-column grid showing:
    - Loan: formatted with `inr` from `@/lib/format`
    - CIBIL: the score number, colored with `cibilTone` from `@/lib/format` (map to text-green-600 / text-yellow-600 / text-red-600)
    - Vehicle: the vehicle name truncated
  - Bottom row: submitted date as relative time (e.g. "3 days ago") in text-xs text-muted-foreground
- For relative time: compute days difference from `submitted` to now. Show "today", "yesterday", "N days ago", or the date if > 30 days.
- Import Badge from `@/components/ui/badge`
- Import `cn` from `@/lib/utils`
- Import `inr`, `cibilTone` from `@/lib/format`
- Wrapper: div with `panel rounded-xl p-4 space-y-2 transition-shadow hover:shadow-md` + optional cursor-pointer when onClick exists
