---
type: new
target: src/components/kyc-status-strip.tsx
model: inkling
---

## Instructions

Create a horizontal strip component that shows KYC verification status for an applicant.

Requirements:
- Named export `KycStatusStrip`
- Props interface `KycStatusStripProps`:
  - `pan: "verified" | "pending" | "failed" | "not_started"`
  - `aadhaar: "verified" | "pending" | "failed" | "not_started"`
  - `mobile: "verified" | "pending" | "failed" | "not_started"`
  - `email?: "verified" | "pending" | "failed" | "not_started"` — optional, omit if not provided
  - `className?: string`
- Render a horizontal flex row of items, each showing:
  - A small icon-like indicator (circle): green check for verified, yellow spinner-like for pending, red X for failed, gray dash for not_started
  - Label text below: "PAN", "Aadhaar", "Mobile", "Email"
  - Status text in matching color: "Verified", "Pending", "Failed", "Not started"
- Use Tailwind only — no SVG, just styled divs/spans with Unicode characters (checkmark, cross, dash, clock)
- Import `cn` from `@/lib/utils`
- The strip should wrap on mobile (flex-wrap)
