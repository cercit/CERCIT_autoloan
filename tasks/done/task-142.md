---
type: new
target: src/lib/supabase-dealers.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module for dealer CRUD operations in Supabase.

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `DealerRow`:
  - `id: string`
  - `created_at: string`
  - `dealer_name: string`
  - `oem: string` — e.g. "Maruti Suzuki", "Hyundai", "Tata Motors"
  - `city: string`
  - `state: string`
  - `tier: "A" | "B" | "C"`
  - `contact_person: string | null`
  - `contact_phone: string | null`
  - `contact_email: string | null`
  - `address: string | null`
  - `active: boolean`
  - `total_applications: number`
  - `approval_rate: number | null` — percentage
- Named export `async function fetchDealers(filters?: {oem?: string; city?: string; tier?: string; active?: boolean; limit?: number; offset?: number}): Promise<DealerRow[]>`
- Named export `async function fetchDealerById(id: string): Promise<DealerRow | null>`
- Named export `async function searchDealers(query: string): Promise<DealerRow[]>` — search by name, OEM, or city (case-insensitive)
- Named export `async function createDealer(data: Omit<DealerRow, "id" | "created_at" | "total_applications" | "approval_rate">): Promise<DealerRow | null>`
- Named export `async function updateDealer(id: string, data: Partial<DealerRow>): Promise<DealerRow | null>`
- Mock fallback: 10 dealers across Maruti, Hyundai, Tata, Mahindra, Kia in Mumbai, Delhi, Bangalore, Chennai, Pune. Mix of tier A/B/C.
- No React
