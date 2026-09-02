# Task 14 — Add form validation to new application wizard

## Goal
The 5-step new application form (`src/routes/applications/new.tsx`) has no field validation. Add client-side validation so required fields show errors before submission.

## Current state
- The form uses local state (`useState`) for each field
- Submit calls `submitFullApplication()` directly — no validation
- Missing fields silently produce bad data or Supabase errors
- No error messages shown to the user

## What to do

### 1. Add validation state and logic to `new.tsx`

Add an `errors` state object: `Record<string, string>` (field name -> error message).

Validate on each step's "Next" button click before advancing. Required fields per step:

**Step 1 — Customer details:**
- `fullName`: required, min 3 characters
- `email`: required, must contain `@`
- `mobile`: required, exactly 10 digits
- `dob`: required
- `pan`: required, must match pattern `[A-Z]{5}[0-9]{4}[A-Z]` (5 letters, 4 digits, 1 letter)

**Step 2 — Employment:**
- `employer`: required (must select from dropdown)
- `city`: required
- `stateCode`: required
- `netSalary`: required, must be > 0

**Step 3 — Loan details:**
- `loanAmount`: required, must be > 0
- `tenure`: required, must be between 12 and 84

**Step 4 — Vehicle:**
- `make`: required
- `model`: required
- `exShowroom`: required, must be > 0
- `onRoad`: required, must be >= exShowroom

**Step 5 — Bureau:**
- `cibilScore`: required, must be between 300 and 900

### 2. Show errors inline
For each field that fails validation, show a red `<p>` below the input with the error message. Use Tailwind class `text-destructive text-xs mt-1`.

Clear the error for a field when the user changes its value.

### 3. Block step advancement on errors
The "Next" / "Submit" button should call a `validateStep(step)` function. If it returns false, set the errors and don't advance. If it returns true, clear errors and proceed.

## Files to edit
- `src/routes/applications/new.tsx` — add validation logic and error display

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
