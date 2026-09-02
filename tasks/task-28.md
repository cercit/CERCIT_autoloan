# Task 28 — Wire obligations from Supabase in application detail

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

The copilot review shows obligations from mock data. Wire it to read from the `obligations` table in Supabase.

## Current state

File: `src/lib/api.ts` — `getApplication()` function (around line 140-180):
- Fetches a single application from `applications` table with joins to `customers`, `vehicles`, `dealers`
- Maps the result through `mapToApplication()` (which uses `applicationRowSchema.parse()`)
- The schema transform sets `obligations: []` (line ~88 in the zod transform)
- The `obligations` DB table has: `obligation_id`, `application_id`, `lender_name`, `loan_type`, `emi_amount`, `outstanding_balance`, `dpd_current`, `source`

File: `src/lib/mock-data.ts` — `Application` type:
- `obligations` is typed as an array of `{ lender: string; type: string; emi: number; outstanding: number; dpd: string; source: string }`

File: `src/components/copilot-review.tsx`:
- Reads `app.obligations` to render the obligations table
- No changes needed here — it already renders whatever is in `app.obligations`

## Steps

### 1. Expand `getApplication()` query in `src/lib/api.ts`

Find the `.select()` call in `getApplication()`. It currently joins customers, vehicles, dealers. Add obligations:

Change the select string to include:
```
obligations(lender_name, loan_type, emi_amount, outstanding_balance, dpd_current, source)
```

### 2. Map obligations after the schema transform

After `mapToApplication()` is called (around line ~170), override the obligations:

```typescript
const obligations = ((data as any).obligations ?? []).map((o: any) => ({
  lender: o.lender_name ?? "",
  type: o.loan_type ?? "",
  emi: Number(o.emi_amount) || 0,
  outstanding: Number(o.outstanding_balance) || 0,
  dpd: String(o.dpd_current ?? "0"),
  source: o.source ?? "Bureau",
}));
if (obligations.length > 0) {
  app.obligations = obligations;
}
```

The `if` check keeps mock data obligations as fallback when the DB has none.

**Important:** The variable `app` must be declared with `let`, not `const`, or use a separate variable. Check whether `mapToApplication()` returns to a `const` or `let`. If it's `const app = mapToApplication(...)`, change it to `let app = mapToApplication(...)` so you can reassign `app.obligations`.

Alternatively, you can avoid the reassignment entirely:

```typescript
const baseApp = mapToApplication({ ...data, ... });
const obligations = ((data as any).obligations ?? []).map((o: any) => ({
  lender: o.lender_name ?? "",
  type: o.loan_type ?? "",
  emi: Number(o.emi_amount) || 0,
  outstanding: Number(o.outstanding_balance) || 0,
  dpd: String(o.dpd_current ?? "0"),
  source: o.source ?? "Bureau",
}));
return { ...baseApp, obligations: obligations.length > 0 ? obligations : baseApp.obligations };
```

Run `npx tsc --noEmit` after the change.

## Files to edit

- `src/lib/api.ts` — expand `getApplication()` query and mapping

## Done when

- `npx tsc --noEmit` exits clean
- `getApplication()` select includes `obligations(...)` join
- Obligations from DB are mapped and override the empty array from the schema
- Mock data fallback preserved (if DB obligations are empty, use what mapToApplication returns)
- No `// # reason:` or `// Self-review` comments in the file
