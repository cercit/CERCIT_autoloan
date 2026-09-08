---
type: new
target: src/lib/supabase-audit-trail.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module for an immutable audit trail in Supabase.

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `AuditEntry`:
  - `id: string`
  - `created_at: string`
  - `application_id: string`
  - `actor_id: string` — user or "system"
  - `actor_name: string`
  - `action: string` — e.g. "application_created", "bureau_fetched", "policy_evaluated", "decision_logged", "document_uploaded", "status_changed", "override_applied", "cam_generated", "esign_completed"
  - `detail: Record<string, unknown>` — JSONB, action-specific payload
  - `ip_address: string | null`
- Named export `async function logAudit(entry: Omit<AuditEntry, "id" | "created_at">): Promise<AuditEntry | null>`
- Named export `async function fetchAuditTrail(applicationId: string, options?: {limit?: number; offset?: number}): Promise<AuditEntry[]>`
  - Returns entries sorted by created_at descending
- Named export `async function fetchRecentActivity(options?: {limit?: number; actorId?: string}): Promise<AuditEntry[]>`
  - Cross-application recent activity feed
- Named export `AUDIT_ACTIONS` — a record mapping action keys to human-readable labels:
  - application_created: "Application created"
  - bureau_fetched: "Bureau report fetched"
  - policy_evaluated: "Policy engine evaluated"
  - decision_logged: "Decision recorded"
  - document_uploaded: "Document uploaded"
  - status_changed: "Status changed"
  - override_applied: "Decision overridden"
  - cam_generated: "CAM generated"
  - esign_completed: "E-sign completed"
  - manual_review_assigned: "Assigned for manual review"
- Mock fallback with 10 sample entries if supabase not configured
- No React
