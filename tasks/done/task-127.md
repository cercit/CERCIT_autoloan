---
type: new
target: src/components/audit-trail-timeline.tsx
context: src/lib/format.ts
---

## Instructions

Create a React timeline component for displaying an application's audit trail.

Requirements:
- Named export `AuditTrailTimeline`
- Props interface `AuditTrailTimelineProps`:
  - `entries: Array<{id: string; created_at: string; actor_name: string; action: string; detail: Record<string, unknown>}>`
  - `className?: string`
- Layout: a vertical timeline with a thin line running down the left side.
  - Each entry is a row with:
    - A colored dot on the timeline line. Color by action type: green for positive actions (application_created, decision_logged with approve, esign_completed), red for negative (decision_logged with decline, override_applied), blue for neutral (bureau_fetched, policy_evaluated, document_uploaded, status_changed, cam_generated).
    - Timestamp formatted as "01 Sep 2026, 14:32" on the left of the dot (or above on mobile).
    - Action label in bold (use human-readable mapping: "application_created" becomes "Application created", etc.).
    - Actor name in muted text: "by Rajeev Menon" or "by System".
    - Detail summary: if detail has a "from" and "to" key, show "Changed from {from} to {to}". If detail has "decision", show the decision. Otherwise show nothing.
  - Most recent entry at the top.
  - If more than 10 entries, show first 10 with a "Show older" button that reveals the rest.
- Import `cn` from `@/lib/utils`
- Use `useState` for the show-more toggle
