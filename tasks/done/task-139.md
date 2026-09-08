---
type: new
target: src/components/disbursal-tracker.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component showing the post-approval disbursal pipeline status.

Requirements:
- Named export `DisbursalTracker`
- Props interface `DisbursalTrackerProps`:
  - `applicationId: string`
  - `applicantName: string`
  - `loanAmount: number`
  - `dealerName: string`
  - `steps: Array<{id: string; label: string; status: "completed" | "in_progress" | "pending" | "failed"; completedAt?: string; note?: string}>`
  - `className?: string`
- If steps array is empty, use these defaults (all pending):
  1. "agreement_signed" — "Loan agreement signed"
  2. "nach_registered" — "NACH mandate registered"
  3. "insurance_verified" — "Vehicle insurance verified"
  4. "rc_hypothecation" — "RC hypothecation initiated"
  5. "disbursal_approved" — "Disbursal approved"
  6. "amount_transferred" — "Amount transferred to dealer"
  7. "confirmation_sent" — "Confirmation sent to customer"
- Layout:
  - Header: "Disbursal status" with applicant name, loan amount in INR, dealer name.
  - Vertical step tracker with a connecting line on the left:
    - Completed steps: green circle with checkmark, label in normal text, completion date below in muted text.
    - In-progress step: blue pulsing dot, label in bold, note text if present.
    - Pending steps: gray empty circle, label in muted text.
    - Failed step: red circle with X, label in red, note as error text.
  - Progress bar at the top: percentage of completed steps.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class
