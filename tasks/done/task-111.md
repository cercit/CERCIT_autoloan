---
type: new
target: src/lib/bureau-score-interpreter.ts
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a TypeScript module that interprets bureau (CIBIL/Experian/CRIF) credit scores into actionable bands and risk signals.

Requirements:
- Named export type `BureauBand`:
  - `band: "green" | "amber-high" | "amber-low" | "red"`
  - `label: string` — e.g. "Excellent", "Good", "Fair", "Poor"
  - `minScore: number`
  - `maxScore: number`
  - `autoDecision: "approve" | "review" | "decline"`
- Named export type `BureauInterpretation`:
  - `score: number`
  - `bureau: "cibil" | "experian" | "crif"`
  - `band: BureauBand`
  - `dpd30Count: number` — number of 30+ DPD instances
  - `dpd60Count: number`
  - `dpd90Count: number`
  - `activeAccounts: number`
  - `enquiryCount90d: number` — enquiries in last 90 days
  - `utilizationPct: number` — credit utilization percentage
  - `flags: string[]` — risk flags like "high_enquiry_velocity", "recent_dpd", "thin_file", "over_leveraged"
- Named export `interpretScore(score: number, bureau?: string): BureauBand`
  - CIBIL bands: 750+ = green/approve, 700-749 = amber-high/review, 650-699 = amber-low/review, below 650 = red/decline
  - Same bands apply to all bureaus for now
- Named export `generateFlags(data: {score: number; dpd30: number; dpd60: number; dpd90: number; activeAccounts: number; enquiries90d: number; utilization: number}): string[]`
  - "high_enquiry_velocity" if enquiries90d > 5
  - "recent_dpd" if dpd30 > 0
  - "severe_delinquency" if dpd90 > 0
  - "thin_file" if activeAccounts < 2
  - "over_leveraged" if utilization > 80
  - "clean_record" if dpd30 === 0 and dpd60 === 0 and dpd90 === 0
- Pure TypeScript, no external dependencies
