---
type: new
target: src/components/application-queue.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component for the internal application queue list with sorting and pagination.

Requirements:
- Named export `ApplicationQueue`
- Props interface `ApplicationQueueProps`:
  - `applications: Array<{id: string; applicantName: string; status: string; loanAmount: number; vehicleModel: string; bureauScore: number | null; policyDecision: string | null; riskGrade: string | null; createdAt: string; assignedTo: string | null}>`
  - `totalCount: number`
  - `currentPage: number`
  - `pageSize: number`
  - `onPageChange?: (page: number) => void`
  - `onSort?: (field: string, direction: "asc" | "desc") => void`
  - `onRowClick?: (id: string) => void`
  - `onStatusFilter?: (status: string | null) => void`
  - `activeStatusFilter: string | null`
  - `className?: string`
- Layout:
  - Top bar: status filter tabs — "All", "Submitted", "Processing", "Review", "Approved", "Declined". Active tab highlighted. Show count next to each status.
  - Table with columns: Applicant (name + ID), Vehicle, Loan Amount, Bureau Score, Decision, Risk Grade, Status, Date, Assigned To.
  - Sortable columns (click header to toggle sort): Applicant, Loan Amount, Bureau Score, Date. Show a small up/down arrow icon on the sorted column.
  - Each row is clickable (calls onRowClick with the application ID). Hover state with light background.
  - Bureau score cell: colored text by band (green 750+, yellow 700-749, orange 650-699, red <650).
  - Status cell: colored badge (same colors as ApplicationSummaryStrip).
  - Risk grade cell: colored letter badge.
  - Loan amount: compact INR format (lakhs/crores for large amounts).
  - Pagination at bottom: "Showing 1-20 of 156" with Previous/Next buttons and page number display.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `useState` for local sort state if onSort not provided
