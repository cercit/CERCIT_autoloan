# Task 60 — Anomaly detection: duplicate applications

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `checkDuplicates(pan, mobile, applicationId)` to `src/lib/api.ts`. It queries Supabase for other applications with the same PAN or mobile number (excluding the current application). Display duplicate warnings on the application detail page as a yellow banner at the top.

## Current state

- `src/lib/api.ts` has the standard `isSupabaseConfigured` / `supabase` pattern
- `src/routes/applications/$id/index.tsx` renders the application detail page
- `Application` type has `pan`, `phone`, and `id` fields
- Supabase `customers` table has `pan_number` and `mobile` columns; `applications` has `application_id` and a foreign key to `customers`
- No duplicate detection exists

## Steps

### 1. Add types and function to `src/lib/api.ts`

```typescript
export type DuplicateMatch = {
  applicationId: string;
  name: string;
  matchField: "PAN" | "Mobile" | "Both";
  status: string;
  submitted: string;
};

export async function checkDuplicates(
  pan: string,
  mobile: string,
  currentApplicationId: string
): Promise<DuplicateMatch[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("applications")
    .select(`
      application_id,
      status,
      created_at,
      customers!inner(full_name, pan_number, mobile)
    `)
    .neq("application_id", currentApplicationId)
    .or(`pan_number.eq.${pan},mobile.eq.${mobile}`, { referencedTable: "customers" });

  if (error || !data) {
    console.error("Duplicate check failed:", error);
    return [];
  }

  return (data as any[]).map((row) => {
    const cust = row.customers;
    const panMatch = cust?.pan_number === pan;
    const mobileMatch = cust?.mobile === mobile;
    return {
      applicationId: row.application_id,
      name: cust?.full_name ?? "Unknown",
      matchField: panMatch && mobileMatch ? "Both" : panMatch ? "PAN" : "Mobile",
      status: mapStatus(row.status ?? "DRAFT") as string,
      submitted: formatDate(row.created_at ?? ""),
    };
  });
}
```

**Note:** The `or` filter with `referencedTable` is Supabase's way to filter on joined tables. If this syntax doesn't work with your version of supabase-js, use an alternative approach — fetch recent applications and filter in JS:

```typescript
export async function checkDuplicates(
  pan: string,
  mobile: string,
  currentApplicationId: string
): Promise<DuplicateMatch[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("applications")
    .select(`
      application_id,
      status,
      created_at,
      customers!inner(full_name, pan_number, mobile)
    `)
    .neq("application_id", currentApplicationId);

  if (error || !data) {
    console.error("Duplicate check failed:", error);
    return [];
  }

  return (data as any[])
    .filter((row) => {
      const cust = row.customers;
      return cust?.pan_number === pan || cust?.mobile === mobile;
    })
    .map((row) => {
      const cust = row.customers;
      const panMatch = cust?.pan_number === pan;
      const mobileMatch = cust?.mobile === mobile;
      return {
        applicationId: row.application_id,
        name: cust?.full_name ?? "Unknown",
        matchField: (panMatch && mobileMatch ? "Both" : panMatch ? "PAN" : "Mobile") as DuplicateMatch["matchField"],
        status: mapStatus(row.status ?? "DRAFT") as string,
        submitted: formatDate(row.created_at ?? ""),
      };
    });
}
```

Run `npx tsc --noEmit`.

### 2. Add duplicate warning banner to `src/routes/applications/$id/index.tsx`

Import new dependencies:

```typescript
import { checkDuplicates } from "@/lib/api";
import type { DuplicateMatch } from "@/lib/api";
import { AlertTriangle } from "lucide-react";
```

Add state and fetch duplicates:

```typescript
const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

useEffect(() => {
  if (app) {
    checkDuplicates(app.pan, app.phone, app.id).then(setDuplicates);
  }
}, [app?.id, app?.pan, app?.phone]);
```

**Note on dependency array:** `app` may be null on first render. Use `app?.id`, `app?.pan`, `app?.phone` as dependencies — the effect runs when the app loads. If this causes a lint warning about optional chaining in deps, use a separate `useEffect` that runs after `app` is set.

Render the warning banner above `<CopilotReview>`:

```tsx
{duplicates.length > 0 && (
  <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
    <p className="flex items-center gap-2 text-sm font-semibold">
      <AlertTriangle className="size-4 text-warning" />
      Potential duplicate applications detected
    </p>
    <ul className="mt-2 space-y-1.5">
      {duplicates.map((dup) => (
        <li key={dup.applicationId} className="flex items-center gap-3 text-sm">
          <Link
            to="/applications/$id"
            params={{ id: dup.applicationId }}
            className="font-medium text-primary hover:underline"
          >
            {dup.applicationId}
          </Link>
          <span className="text-muted-foreground">
            {dup.name} — matched on {dup.matchField} — {dup.status} — {dup.submitted}
          </span>
        </li>
      ))}
    </ul>
  </div>
)}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `DuplicateMatch` type and `checkDuplicates` function
- `src/routes/applications/$id/index.tsx` — add duplicate check on load and warning banner

## Done when

- `npx tsc --noEmit` exits clean
- `checkDuplicates` returns an empty array when Supabase is not configured (mock fallback)
- `checkDuplicates` queries for matching PAN or mobile, excluding the current application
- Each match shows which field matched (PAN, Mobile, or Both)
- Warning banner appears at the top of the application detail page when duplicates are found
- Banner is hidden when there are no duplicates
- Each duplicate application ID is a clickable link to that application
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/link has a working handler
- Every new data field resolves from its source, not a hardcoded fallback
