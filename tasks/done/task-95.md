---
type: new
target: src/components/approval-stamp.tsx
model: gemini-flash
---

## Instructions

Create a visual stamp/badge overlay component showing loan decision status.

Requirements:
- Named export `ApprovalStamp`
- Props interface `ApprovalStampProps`:
  - `decision: "Approve" | "Maybe" | "Reject"`
  - `size?: "sm" | "md" | "lg"` — defaults to "md"
  - `className?: string`
- Render a rotated (-12deg) stamp-like element with:
  - Double border (outer solid, inner dashed) in the decision color
  - "APPROVED" / "REVIEW" / "REJECTED" text in uppercase, bold, matching color
  - Approve: green, Maybe: amber/yellow, Reject: red
- Size variants: sm = text-xs + 64px wide, md = text-sm + 96px wide, lg = text-base + 128px wide
- The stamp should look like a rubber stamp impression — slightly rough/angled
- Use `transform: rotate(-12deg)` inline style for the tilt
- Import `cn` from `@/lib/utils`
- No external dependencies
