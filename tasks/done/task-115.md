---
type: new
target: src/components/bureau-report-card.tsx
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a React card component displaying a bureau credit report summary.

Requirements:
- Named export `BureauReportCard`
- Props interface `BureauReportCardProps`:
  - `bureau: string` — "CIBIL", "Experian", or "CRIF"
  - `score: number`
  - `band: "green" | "amber-high" | "amber-low" | "red"`
  - `bandLabel: string` — e.g. "Excellent", "Good"
  - `dpd30: number`
  - `dpd60: number`
  - `dpd90: number`
  - `activeAccounts: number`
  - `enquiries90d: number`
  - `utilizationPct: number`
  - `flags: string[]`
  - `fetchedAt?: string` — ISO date when report was pulled
  - `className?: string`
- Layout:
  - Header: bureau name + score displayed large. Score colored by band (green/amber/red tones).
  - Band label as a pill badge next to the score.
  - A horizontal gauge/progress bar from 300-900 with a marker at the score position.
  - Below the gauge: a 3-column grid showing DPD counts (30/60/90), colored red if > 0.
  - Second row: active accounts, enquiries (orange if > 5), utilization % (red if > 80%).
  - Flags section: each flag as a small pill — "clean_record" in green, risk flags in red/orange.
  - Footer: "Report fetched: 01 Sep 2026" in muted text (if fetchedAt provided).
- Import `cn` from `@/lib/utils`
- Use `panel` class for the card container
