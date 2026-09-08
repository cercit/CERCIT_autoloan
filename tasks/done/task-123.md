---
type: new
target: src/lib/supabase-application.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module with Supabase CRUD operations for the applications table.

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `ApplicationRow`:
  - `id: string`
  - `created_at: string`
  - `updated_at: string`
  - `status: "draft" | "submitted" | "processing" | "approved" | "declined" | "review"`
  - `applicant_name: string`
  - `applicant_pan: string`
  - `applicant_aadhaar_masked: string`
  - `applicant_age: number`
  - `employer_name: string`
  - `employer_category: string`
  - `gross_monthly_income: number`
  - `vehicle_make: string`
  - `vehicle_model: string`
  - `vehicle_segment: string`
  - `ex_showroom_price: number`
  - `on_road_price: number`
  - `loan_amount: number`
  - `tenure_months: number`
  - `interest_rate: number`
  - `emi: number`
  - `dealer_id: string | null`
  - `bureau_score: number | null`
  - `foir_pct: number | null`
  - `ltv_pct: number | null`
  - `policy_score: number | null`
  - `policy_decision: string | null`
  - `risk_score: number | null`
  - `risk_grade: string | null`
- Named export `async function fetchApplications(filters?: {status?: string; limit?: number; offset?: number}): Promise<ApplicationRow[]>`
- Named export `async function fetchApplicationById(id: string): Promise<ApplicationRow | null>`
- Named export `async function createApplication(data: Partial<ApplicationRow>): Promise<ApplicationRow | null>`
- Named export `async function updateApplication(id: string, data: Partial<ApplicationRow>): Promise<ApplicationRow | null>`
- Named export `async function updateApplicationStatus(id: string, status: string): Promise<boolean>`
- Each function should use the supabase client. If supabase is not configured (no URL/key), return mock data with a console.warn.
- Mock data: generate 5 sample applications with realistic Indian names, SBI/HDFC employers, Maruti/Hyundai vehicles, scores in range.
- No React, just async functions
