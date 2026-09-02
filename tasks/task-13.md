# Task 13 — Wire dashboard TAT chart to real data

## Goal
The dashboard's "Average Turnaround Time" bar chart uses hardcoded `tatData` from mock-data. Replace it with computed data from the `applications` table.

## Current state
- `dashboard.tsx` imports `tatData` from `@/lib/mock-data` — an array of `{ week, minutes }`
- The real `applications` table has `created_at` and `updated_at` timestamps
- Applications that go from DRAFT to APPROVED/REJECTED have a measurable turnaround
- No function in `api.ts` computes TAT

## What to do

### 1. Add `getDashboardTat()` to `src/lib/api.ts`
- Query applications that have a final status (`APPROVED` or `REJECTED`)
- For each, compute TAT in minutes: `(updated_at - created_at)` converted to minutes
- Group by ISO week (use `created_at` date to determine week)
- Return array of `{ week: string, minutes: number }` — week label like "W35" or "26 Aug", minutes is the average for that week
- Cap at last 4 weeks
- Return `tatData` from mock-data as fallback if no Supabase or no data

### 2. Update `dashboard.tsx`
- Import and call `getDashboardTat()` inside the existing `Promise.all`
- Replace the static `tatData` reference with the fetched data

## Files to edit
- `src/lib/api.ts` — add `getDashboardTat()`
- `src/routes/dashboard.tsx` — fetch TAT data instead of using mock

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
