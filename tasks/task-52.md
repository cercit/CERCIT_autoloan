# Task 52 — Assessment history in Supabase

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `saveAssessment(applicationId, result)` and `getAssessmentHistory(applicationId)` to `src/lib/api.ts`. Wire a "Run Assessment" button in `copilot-review.tsx` that triggers the pipeline and saves the result. Show assessment history if available.

## Current state

- `src/lib/api.ts` has the standard `isSupabaseConfigured` guard pattern and imports `supabase` from `@/lib/supabase`
- `src/lib/engine.ts` exports `runAssessment(app)` → `AssessmentResult` (task 50)
- `src/components/copilot-review.tsx` already calls `runAssessment` via `useMemo` (task 51)
- Supabase has a `recommendations` table (used in existing queries) — the assessment JSON can be stored there or in a new logical column
- No assessment save/load functions exist yet

## Steps

### 1. Define types and add functions to `src/lib/api.ts`

```typescript
import type { AssessmentResult } from "@/lib/engine";

export type SavedAssessment = {
  id: string;
  applicationId: string;
  result: AssessmentResult;
  createdAt: string;
};

export async function saveAssessment(
  applicationId: string,
  result: AssessmentResult
): Promise<boolean> {
  if (!isSupabaseConfigured) return true;

  const { error } = await supabase.from("credit_assessments").insert({
    application_id: applicationId,
    assessment_json: result,
    decision: result.decision.decision,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to save assessment:", error);
    return false;
  }
  return true;
}

export async function getAssessmentHistory(
  applicationId: string
): Promise<SavedAssessment[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("credit_assessments")
    .select("id, application_id, assessment_json, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Failed to fetch assessment history:", error);
    return [];
  }

  return (data as any[]).map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    result: row.assessment_json as AssessmentResult,
    createdAt: new Date(row.created_at).toLocaleString("en-IN"),
  }));
}
```

Run `npx tsc --noEmit`.

### 2. Add "Run Assessment" button in `src/components/copilot-review.tsx`

Import the new API functions:

```typescript
import { saveAssessment, getAssessmentHistory } from "@/lib/api";
import type { SavedAssessment } from "@/lib/api";
```

Add state for the saved assessment and loading:

```typescript
const [saving, setSaving] = useState(false);
const [history, setHistory] = useState<SavedAssessment[]>([]);
```

Add a `useEffect` to load history on mount:

```typescript
useEffect(() => {
  getAssessmentHistory(app.id).then(setHistory);
}, [app.id]);
```

Add a handler:

```typescript
async function handleRunAssessment() {
  setSaving(true);
  const result = runAssessment(app);
  const ok = await saveAssessment(app.id, result);
  setSaving(false);
  if (ok) {
    toast.success("Assessment saved");
    getAssessmentHistory(app.id).then(setHistory);
  } else {
    toast.error("Failed to save assessment");
  }
}
```

Add a "Run Assessment" button near the top action bar (next to existing Approve/Reject buttons):

```tsx
<Button variant="outline" disabled={saving} onClick={handleRunAssessment}>
  {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
  Run Assessment
</Button>
```

If `history.length > 0`, show a small section below the recommendation with the last assessment timestamp:

```tsx
{history.length > 0 && (
  <p className="mt-2 text-xs text-muted-foreground">
    Last assessment: {history[0].createdAt} — {history[0].result.decision.decision}
  </p>
)}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `SavedAssessment` type, `saveAssessment`, `getAssessmentHistory`
- `src/components/copilot-review.tsx` — add "Run Assessment" button, load/display history

## Done when

- `npx tsc --noEmit` exits clean
- `saveAssessment` stores the full JSON to Supabase (or returns true in mock mode)
- `getAssessmentHistory` returns saved assessments (or empty array in mock mode)
- "Run Assessment" button calls the pipeline, saves the result, and shows a toast
- Assessment history loads on component mount
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/link has a working handler
- Every new data field resolves from its source, not a hardcoded fallback
