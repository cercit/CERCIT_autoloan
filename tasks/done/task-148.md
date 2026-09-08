---
type: new
target: src/components/dashboard-kpi-row.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component showing a row of key performance indicator cards for the internal dashboard.

Requirements:
- Named export `DashboardKPIRow`
- Props interface `DashboardKPIRowProps`:
  - `totalApplications: number`
  - `approvedCount: number`
  - `declinedCount: number`
  - `pendingReviewCount: number`
  - `approvalRate: number` — percentage
  - `avgProcessingHours: number`
  - `totalDisbursedAmount: number`
  - `todayApplications: number`
  - `className?: string`
- Layout: a horizontal row of 4 KPI cards using CSS grid (2x2 on mobile, 4x1 on desktop).
  - Card 1 "Applications": totalApplications as large number, todayApplications as small "+N today" badge in blue.
  - Card 2 "Approval rate": approvalRate as large percentage, a small donut/ring SVG showing approved (green) vs declined (red) vs pending (yellow) proportions.
  - Card 3 "Avg processing time": avgProcessingHours formatted as "X.Y hrs" (or "X min" if < 1 hour). Color: green if < 4hrs, yellow if 4-12hrs, red if > 12hrs.
  - Card 4 "Disbursed": totalDisbursedAmount in compact INR (lakhs/crores). A small upward-arrow icon if positive.
- Each card: panel class, slight shadow, number displayed large (text-2xl), label in small muted text above.
- Trend indicators: each card can optionally show a small green up-arrow or red down-arrow (just hardcode up-arrow for now as placeholder).
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
