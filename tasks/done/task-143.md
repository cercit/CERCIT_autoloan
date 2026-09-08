---
type: new
target: src/lib/supabase-rpc.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module wrapping the existing Supabase PostgreSQL RPC functions.

Requirements:
- Import supabase client from `@/lib/supabase`
- These RPCs already exist in Supabase. Create typed wrappers for each:

1. Named export `async function rpcRunAssessment(applicationId: string): Promise<{decision: string; band: string; score: number; failed_rules: unknown[]} | null>`
   - Calls `rpc('run_assessment_pipeline', {p_application_id: applicationId})`

2. Named export `async function rpcCalculateEMI(principal: number, annualRate: number, tenureMonths: number): Promise<number | null>`
   - Calls `rpc('calculate_emi', {p_principal: principal, p_annual_rate: annualRate, p_tenure_months: tenureMonths})`

3. Named export `async function rpcGetDashboardStats(): Promise<{total_applications: number; approved: number; declined: number; pending_review: number; avg_processing_time_hours: number; approval_rate: number} | null>`
   - Calls `rpc('get_dashboard_stats')`

4. Named export `async function rpcListApplications(filters: {status?: string; limit?: number; offset?: number}): Promise<unknown[] | null>`
   - Calls `rpc('list_applications', {p_status: filters.status, p_limit: filters.limit ?? 20, p_offset: filters.offset ?? 0})`

5. Named export `async function rpcGetApplicantHistory(pan: string): Promise<unknown[] | null>`
   - Calls `rpc('get_applicant_history', {p_pan: pan})`

6. Named export `async function rpcUpdatePolicyRules(rules: unknown[]): Promise<boolean>`
   - Calls `rpc('update_policy_rules', {p_rules: rules})`

7. Named export `async function rpcGetSchemeBySegment(segment: string): Promise<unknown[] | null>`
   - Calls `rpc('get_schemes_by_segment', {p_segment: segment})`

8. Named export `async function rpcLogAuditEvent(applicationId: string, action: string, detail: Record<string, unknown>): Promise<boolean>`
   - Calls `rpc('log_audit_event', {p_application_id: applicationId, p_action: action, p_detail: detail})`

- Each wrapper: call supabase.rpc(), check for errors, return data or null. Log errors with console.error.
- If supabase not configured, return reasonable mock data for each function.
- No React
