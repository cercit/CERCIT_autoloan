---
type: new
target: src/lib/supabase-bureau.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module with Supabase operations for bureau reports.

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `BureauReportRow`:
  - `id: string`
  - `application_id: string`
  - `created_at: string`
  - `bureau_source: "cibil" | "experian" | "crif"`
  - `score: number`
  - `band: string`
  - `dpd_30_count: number`
  - `dpd_60_count: number`
  - `dpd_90_count: number`
  - `active_accounts: number`
  - `enquiry_count_90d: number`
  - `utilization_pct: number`
  - `flags: string[]` — stored as JSONB in Supabase
  - `raw_response: Record<string, unknown> | null` — full API response stored as JSONB
- Named export `async function fetchBureauReport(applicationId: string): Promise<BureauReportRow | null>`
- Named export `async function saveBureauReport(report: Omit<BureauReportRow, "id" | "created_at">): Promise<BureauReportRow | null>`
- Named export `async function fetchBureauHistory(pan: string, limit?: number): Promise<BureauReportRow[]>` — fetch past reports for the same PAN across applications
- If supabase is not configured, return mock data with realistic values (CIBIL score 742, 0 DPD90, 2 active accounts, etc.)
- No React
