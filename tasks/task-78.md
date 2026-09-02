# Task 78 — Public eligibility checker page

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create a standalone public page (no auth required) where a potential borrower can check their rough eligibility for a vehicle loan. The page takes basic inputs (income, CIBIL score range, loan amount, vehicle type) and shows a preliminary result.

## Current state

- `src/routes/__root.tsx` wraps all routes — it has a `beforeLoad` auth guard
- `src/lib/engine.ts` has `quickEligibility` from task 73
- `src/lib/format.ts` exports `inr()` and `emiFor()`
- TanStack Router uses `createFileRoute` for route definitions
- No public page exists

## Steps

### 1. Create `src/routes/check-eligibility.tsx`

Create a new route that:
- Uses `createFileRoute("/check-eligibility")`
- Does NOT require auth — add `beforeLoad` that returns without checking auth, or configure the route to skip the root auth guard
- Has a clean, minimal layout (no sidebar) — don't use `AppShell`
- Shows the cercit logo/name at the top, a tagline, and the form

Form fields:
- Monthly income (number input)
- CIBIL score range (Select: "750+", "700-749", "650-699", "Below 650")
- Loan amount (number input)
- Tenure (Select: "36 months", "48 months", "60 months", "72 months", "84 months")
- Existing EMI obligations (number input, default 0)

On submit:
- Call `quickEligibility` with the form values
- Show the result below the form:
  - LIKELY_APPROVE: green card with "You're likely eligible!" + estimated EMI
  - MAYBE: amber card with "You might be eligible" + estimated EMI + improvement tips
  - LIKELY_REJECT: red card with "Eligibility is uncertain" + reasons + suggestion to contact a branch

Include a "Apply now" button in the result that links to `/applications/new` (this would require login).

Run `npx tsc --noEmit`.

### 2. Skip auth for this route

In `src/routes/__root.tsx`, check if the current path is `/check-eligibility` and skip the auth check for it. Or handle this in the route's own `beforeLoad`.

Run `npx tsc --noEmit`.

## Files to edit

- `src/routes/check-eligibility.tsx` — new file
- `src/routes/__root.tsx` — allow unauthenticated access to `/check-eligibility`

## Done when

- `npx tsc --noEmit` exits clean
- Page loads without requiring authentication
- Form renders with all 5 input fields
- Submitting the form shows a color-coded eligibility result
- Estimated EMI is calculated and displayed
- "Apply now" button links to the application form
- Page has its own clean layout (no sidebar)
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button has a working handler
