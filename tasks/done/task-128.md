---
type: new
target: src/components/application-summary-strip.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component showing a compact horizontal summary strip for one loan application.

Requirements:
- Named export `ApplicationSummaryStrip`
- Props interface `ApplicationSummaryStripProps`:
  - `applicationId: string`
  - `applicantName: string`
  - `status: "draft" | "submitted" | "processing" | "approved" | "declined" | "review"`
  - `loanAmount: number`
  - `vehicleModel: string`
  - `bureauScore: number | null`
  - `policyDecision: string | null`
  - `riskGrade: string | null`
  - `createdAt: string`
  - `onClick?: () => void`
  - `className?: string`
- Layout: a single horizontal card row designed for a list view.
  - Left section: applicant name (bold) with application ID below in small muted text.
  - Center section: three compact metric chips in a row:
    - Vehicle model (e.g. "Maruti Swift")
    - Loan amount in INR (e.g. "7.5L")
    - Bureau score with colored background matching band
  - Right section:
    - Status badge: draft=gray, submitted=blue, processing=yellow, approved=green, declined=red, review=orange.
    - Risk grade letter if available (colored: A=green, B=teal, C=yellow, D=orange, E=red).
    - Date in small muted text, formatted as "01 Sep".
  - Whole strip is clickable if onClick provided (cursor-pointer, hover bg change).
- For loan amount display: if >= 10000000 show as "1.0Cr", if >= 100000 show as "7.5L", otherwise use inr().
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
