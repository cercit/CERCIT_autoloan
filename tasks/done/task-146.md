---
type: new
target: src/components/customer-status-tracker.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component for the customer-facing application status tracker.

Requirements:
- Named export `CustomerStatusTracker`
- Props interface `CustomerStatusTrackerProps`:
  - `applicationId: string`
  - `applicantName: string`
  - `currentStatus: "submitted" | "documents_pending" | "under_review" | "bureau_check" | "assessment" | "approved" | "declined" | "disbursal"
  - `loanAmount: number`
  - `vehicleModel: string`
  - `submittedAt: string`
  - `lastUpdatedAt: string`
  - `statusHistory: Array<{status: string; timestamp: string; message: string}>`
  - `nextAction?: string | null` — e.g. "Upload remaining documents" or "No action needed"
  - `className?: string`
- Layout:
  - Header card: application ID, applicant name, loan amount, vehicle model, submitted date.
  - Horizontal progress tracker showing major stages: Submitted → Documents → Review → Assessment → Decision → Disbursal. Current stage highlighted, completed stages with checkmarks, future stages grayed out.
  - Map the currentStatus to a stage position: submitted=0, documents_pending=1, under_review=2, bureau_check=2, assessment=3, approved=4, declined=4, disbursal=5.
  - Status detail card: current status in large text with a colored icon (blue for in-progress, green for approved, red for declined). "Last updated: 2 hours ago" relative time text.
  - Next action banner: if nextAction is set, show it in a highlighted blue box with an arrow icon.
  - History timeline: compact list of past status changes with timestamp and message, most recent first.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class
