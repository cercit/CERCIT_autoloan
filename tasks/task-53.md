# Task 53 — Application status state machine

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create `src/lib/workflow.ts` with a status transition map that enforces valid state changes. Add `transitionStatus(applicationId, from, to)` to `src/lib/api.ts` that validates the transition before updating Supabase. This prevents illegal jumps (e.g. "New" directly to "Sanctioned").

## Current state

- `src/lib/mock-data.ts` defines `AppStatus` type: `"New" | "Documents Uploaded" | "Under Review" | "Referred" | "Sanctioned" | "Rejected"`
- `src/lib/api.ts` has the standard `isSupabaseConfigured` / `supabase` pattern
- Supabase `applications` table has a `status` column (stores values like `DRAFT`, `DOCUMENTS_SUBMITTED`, etc.)
- `api.ts` already has `mapStatus()` that maps Supabase status strings to `AppStatus` values (line ~103)
- No workflow validation exists — status changes happen directly in Supabase functions

## Steps

### 1. Create `src/lib/workflow.ts`

```typescript
import type { AppStatus } from "@/lib/mock-data";

export const validTransitions: Record<AppStatus, AppStatus[]> = {
  "New": ["Documents Uploaded"],
  "Documents Uploaded": ["Under Review"],
  "Under Review": ["Referred", "Sanctioned", "Rejected"],
  "Referred": ["Under Review", "Sanctioned", "Rejected"],
  "Sanctioned": [],
  "Rejected": [],
};

export function isValidTransition(from: AppStatus, to: AppStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function getAvailableTransitions(status: AppStatus): AppStatus[] {
  return validTransitions[status] ?? [];
}
```

Run `npx tsc --noEmit`.

### 2. Add the reverse status map and `transitionStatus` to `src/lib/api.ts`

The existing `mapStatus` converts Supabase → UI. We need the reverse to convert UI → Supabase:

```typescript
import { isValidTransition } from "@/lib/workflow";
import type { AppStatus } from "@/lib/mock-data";

const reverseStatusMap: Record<AppStatus, string> = {
  "New": "DRAFT",
  "Documents Uploaded": "DOCUMENTS_SUBMITTED",
  "Under Review": "UNDER_ASSESSMENT",
  "Referred": "UNDER_REVIEW",
  "Sanctioned": "APPROVED",
  "Rejected": "REJECTED",
};

export async function transitionStatus(
  applicationId: string,
  from: AppStatus,
  to: AppStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isValidTransition(from, to)) {
    return { success: false, error: `Invalid transition: ${from} → ${to}` };
  }

  if (!isSupabaseConfigured) {
    return { success: true };
  }

  const newStatus = reverseStatusMap[to];
  if (!newStatus) {
    return { success: false, error: `Unknown status: ${to}` };
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: newStatus })
    .eq("application_id", applicationId);

  if (error) {
    console.error("Status transition failed:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/workflow.ts` — new file with transition map and validation functions
- `src/lib/api.ts` — add `transitionStatus` function and reverse status map

## Done when

- `npx tsc --noEmit` exits clean
- `workflow.ts` exports `validTransitions`, `isValidTransition`, and `getAvailableTransitions`
- `isValidTransition("New", "Documents Uploaded")` returns `true`
- `isValidTransition("New", "Sanctioned")` returns `false`
- `getAvailableTransitions("Under Review")` returns `["Referred", "Sanctioned", "Rejected"]`
- `transitionStatus` validates the transition before calling Supabase
- `transitionStatus` returns `{ success: true }` in mock mode for valid transitions
- `transitionStatus` returns `{ success: false, error }` for invalid transitions even in mock mode
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new function is exported
