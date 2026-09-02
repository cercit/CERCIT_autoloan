# Task 62 — Escalation workflow: assign to senior, add notes

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add an escalation workflow that lets a credit officer escalate an application to a senior reviewer. The officer selects a reason for escalation, adds notes, and the application status changes to "ESCALATED" with the senior reviewer assigned.

## Current state

- `src/routes/applications/$id/index.tsx` renders the application detail page
- `src/lib/api.ts` has the standard `isSupabaseConfigured` / `supabase` pattern
- `src/lib/mock-data.ts` has mock users data
- No escalation mechanism exists

## Steps

### 1. Add escalation types and function to `src/lib/api.ts`

```typescript
export type EscalationPayload = {
  applicationId: string;
  reason: "HIGH_EXPOSURE" | "POLICY_EXCEPTION" | "FRAUD_SUSPICION" | "INCOMPLETE_DOCS" | "OTHER";
  notes: string;
  escalatedBy: string;
};

export async function escalateApplication(
  payload: EscalationPayload
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 500));
  }
  const { error } = await supabase.from("escalations").insert({
    application_id: payload.applicationId,
    reason: payload.reason,
    notes: payload.notes,
    escalated_by: payload.escalatedBy,
  });
  if (error) return { error: error.message };
  await supabase
    .from("applications")
    .update({ status: "ESCALATED" })
    .eq("application_id", payload.applicationId);
  return { error: null };
}

export async function getEscalationHistory(
  applicationId: string
): Promise<{ reason: string; notes: string; escalatedBy: string; createdAt: string }[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("escalations")
    .select("reason, notes, escalated_by, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row: any) => ({
    reason: row.reason,
    notes: row.notes,
    escalatedBy: row.escalated_by,
    createdAt: row.created_at,
  }));
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/escalation-dialog.tsx`

Build a component that:
- Takes `applicationId: string` and `onEscalate: () => void` as props
- Shows a `Dialog` triggered by an "Escalate" button (use `AlertTriangle` icon from lucide-react)
- Inside the dialog: a `Select` for the escalation reason (the 5 values from `EscalationPayload["reason"]`), a `Textarea` for notes, and a Submit button
- Calls `escalateApplication` on submit
- Shows toast on success/error
- Calls `onEscalate` callback after success

Run `npx tsc --noEmit`.

### 3. Add `<EscalationDialog>` to `src/routes/applications/$id/index.tsx`

Import and render the escalation button near the override panel (task 61). Pass `applicationId` and a refetch handler.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add escalation types and functions
- `src/components/escalation-dialog.tsx` — new file
- `src/routes/applications/$id/index.tsx` — import and render escalation dialog

## Done when

- `npx tsc --noEmit` exits clean
- Escalation dialog renders with reason select, notes textarea, and submit button
- `escalateApplication` has mock-data fallback
- `getEscalationHistory` has mock-data fallback (returns empty array)
- Toast shows on success/error
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button has a working handler
