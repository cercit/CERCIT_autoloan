# Task 11 — Wire rate grid page to Supabase

## Goal
The rate grid page (`src/routes/rate-grid.tsx`) falls back to mock data because the DB schema doesn't match what the UI expects. Fix the mapping so it reads from Supabase when configured.

## Current state
- `getRateGrid()` in `src/lib/api.ts` queries `rate_grid` table and returns raw rows
- `rate-grid.tsx` tries to map DB rows to `{ band, catA, catB, catC }` but the field names don't line up reliably
- Mock data in `src/lib/mock-data.ts` has a `rateGrid` array with the correct shape
- DB has 3 rows: APPROVE (750-900, 8.99%), MAYBE (650-749, 9.90%), REJECT (300-649, no rate)

## What to do

### 1. Update `getRateGrid()` in `src/lib/api.ts`
- Query `rate_grid` and select `band_label, score_band_min, score_band_max, rate_pct`
- Transform each row into `{ band: string, catA: number, catB: number, catC: number }`
  - `band` = `band_label` (e.g. "APPROVE") or fallback to `"${score_band_min}-${score_band_max}"`
  - `catA` = `rate_pct` (base rate)
  - `catB` = `rate_pct + 0.40` (round to 2 decimals)
  - `catC` = `rate_pct + 1.25` (round to 2 decimals)
  - Skip rows where `rate_pct` is null or 0 (REJECT band has no rate)
- Return the mock `rateGrid` array as fallback if Supabase isn't configured or query fails

### 2. Simplify `rate-grid.tsx`
- Remove the inline mapping logic from the `useEffect` — just call `getRateGrid()` and use the result directly
- The page already renders `gridData.map(...)` correctly, so this is mostly cleanup

## Files to edit
- `src/lib/api.ts` — update `getRateGrid()` return type and transformation
- `src/routes/rate-grid.tsx` — simplify the useEffect to just set state from API

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
