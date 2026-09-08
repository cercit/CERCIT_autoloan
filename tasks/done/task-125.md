---
type: new
target: src/lib/supabase-decision-log.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module for logging and retrieving credit decisions in Supabase.

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `DecisionLogRow`:
  - `id: string`
  - `application_id: string`
  - `created_at: string`
  - `decision: "approve" | "review" | "decline"`
  - `decision_band: "green" | "amber-high" | "amber-low" | "red"`
  - `policy_score: number`
  - `risk_score: number`
  - `risk_grade: string`
  - `bureau_score: number`
  - `foir_pct: number`
  - `ltv_pct: number`
  - `passed_rules: string[]` — JSONB
  - `failed_rules: Array<{id: string; description: string; severity: string}>` — JSONB
  - `recommendation: string`
  - `decided_by: "system" | "manual"`
  - `reviewer_id: string | null`
  - `reviewer_notes: string | null`
  - `overridden: boolean`
  - `override_reason: string | null`
- Named export `async function logDecision(data: Omit<DecisionLogRow, "id" | "created_at">): Promise<DecisionLogRow | null>`
- Named export `async function fetchDecisionLog(applicationId: string): Promise<DecisionLogRow | null>`
- Named export `async function fetchDecisionHistory(filters?: {decision?: string; band?: string; limit?: number; offset?: number}): Promise<DecisionLogRow[]>`
- Named export `async function overrideDecision(id: string, reviewerId: string, newDecision: string, reason: string): Promise<boolean>`
- Mock fallback if supabase not configured
- No React
