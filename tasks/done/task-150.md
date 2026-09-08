---
type: new
target: src/components/manual-review-workspace.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component for the credit officer's manual review workspace — the main screen for reviewing amber-band applications.

Requirements:
- Named export `ManualReviewWorkspace`
- Props interface `ManualReviewWorkspaceProps`:
  - `applicationId: string`
  - `applicantName: string`
  - `currentDecision: string`
  - `currentBand: string`
  - `policyScore: number`
  - `bureauScore: number`
  - `foirPct: number`
  - `ltvPct: number`
  - `riskGrade: string`
  - `failedRules: Array<{id: string; description: string; severity: string}>`
  - `documents: Array<{type: string; status: string; confidence: string | null}>` 
  - `onApprove?: (notes: string) => void`
  - `onDecline?: (notes: string, reason: string) => void`
  - `onRequestInfo?: (infoType: string, message: string) => void`
  - `onOverride?: () => void`
  - `className?: string`
- Layout:
  - Header: application ID, applicant name, current decision badge, band strip.
  - Left column (60% width): "Assessment summary" section
    - 4 metric boxes in a 2x2 grid: Bureau score (with band color), FOIR %, LTV %, Risk grade (with letter color).
    - Policy flags: list of failed rules with severity indicators.
    - Document status: compact checklist — each document type with a status icon (green check for verified, yellow clock for processing, red X for failed, gray circle for pending).
  - Right column (40% width): "Review actions" section
    - Reviewer notes textarea: "Add your assessment notes..." (required for any action).
    - Three action buttons stacked:
      - "Approve" (green) — enabled only if notes filled. Calls onApprove(notes).
      - "Decline" (red) — opens an inline decline reason dropdown (Insufficient income, High risk, Incomplete documents, Policy violation, Other) + calls onDecline(notes, reason).
      - "Request more info" (blue outline) — opens inline: info type dropdown (Additional income proof, Updated bank statement, Employment verification, Other) + message input. Calls onRequestInfo.
    - "Override decision" link at bottom (calls onOverride) — shown only if current decision is not "approve".
- Import `cn` from `@/lib/utils`
- Use `panel` class
- Use `useState` for notes, action-specific form states
