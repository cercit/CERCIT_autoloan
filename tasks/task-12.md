# Task 12 — Wire users page to Supabase

## Goal
The users page (`src/routes/users.tsx`) reads from `mockUsers` in mock-data.ts. Wire it to the `users` table in Supabase so it shows real seeded user data.

## Current state
- `users.tsx` imports `users` directly from `@/lib/mock-data`
- No `getUsers()` function exists in `api.ts`
- The `users` table in Supabase has 3 demo users seeded: credit officer, state head, admin
- The mock `users` array shape: `{ name, email, role, limit, branch, status }`

## What to do

### 1. Add `getUsers()` to `src/lib/api.ts`
- Query `users` table: select `full_name, email, role, approval_limit, branch_code, is_active`
- Transform to match mock shape:
  - `name` = `full_name`
  - `email` = `email`
  - `role` = `role` (values: `CREDIT_OFFICER`, `STATE_HEAD`, `ADMIN` — map to display labels: "Credit Officer", "State Credit Head", "Admin")
  - `limit` = format `approval_limit` as INR string (use the `inr()` helper from `src/lib/format.ts`)
  - `branch` = `branch_code` or "All branches" for admin/state head
  - `status` = `is_active` ? "Active" : "Inactive"
- Return `mockUsers` as fallback

### 2. Update `src/routes/users.tsx`
- Import `getUsers` from `@/lib/api` instead of `users` from mock-data
- Add `useState` + `useEffect` to fetch on mount (same pattern as other pages)
- Remove the direct mock-data import

## Files to edit
- `src/lib/api.ts` — add `getUsers()`
- `src/routes/users.tsx` — switch from static mock to API call

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
