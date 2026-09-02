# Task 61 — Manual override panel for Amber/Red decisions

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a manual override panel to the application detail page that lets a credit officer change the system decision (approve/reject/hold) with a mandatory reason. This is the primary exception-handling mechanism for cases where the automated decision needs human correction.

## Current state

- `src/routes/applications/$id/index.tsx` renders the application detail page
- `src/components/copilot-review.tsx` shows the automated decision and score
- `src/lib/api.ts` has the standard `isSupabaseConfigured` / `supabase` pattern
- Decision bands exist: Green, Amber-High, Amber-Low, Red
- No manual override capability exists

## Steps

### 1. Add `submitOverride` function to `src/lib/api.ts`

```typescript
export type OverridePayload = {
  applicationId: string;
  originalDecision: string;
  overrideDecision: "APPROVE" | "REJECT" | "HOLD";
  reason: string;
  overriddenBy: string;
};

export async function submitOverride(
  payload: OverridePayload
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 500));
  }
  const { error } = await supabase.from("decision_overrides").insert({
    application_id: payload.applicationId,
    original_decision: payload.originalDecision,
    override_decision: payload.overrideDecision,
    reason: payload.reason,
    overridden_by: payload.overriddenBy,
  });
  if (error) return { error: error.message };
  await supabase
    .from("applications")
    .update({ status: payload.overrideDecision, is_overridden: true })
    .eq("application_id", payload.applicationId);
  return { error: null };
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/override-panel.tsx`

Build a component that:
- Takes `applicationId: string`, `currentDecision: string`, and `onOverride: () => void` as props
- Shows a `Dialog` (from shadcn) triggered by an "Override Decision" button
- Inside the dialog: a `Select` for the new decision (APPROVE / REJECT / HOLD), a `Textarea` for the reason (required, min 20 characters), and a Submit button
- Calls `submitOverride` on submit
- Shows toast on success/error (use `toast` from `sonner`)
- Calls `onOverride` callback after successful submission
- Disable submit if reason is under 20 characters

Run `npx tsc --noEmit`.

### 3. Add `<OverridePanel>` to `src/routes/applications/$id/index.tsx`

Import and render `<OverridePanel>` after the copilot review section. Pass `applicationId={app.id}`, `currentDecision={app.status}`, and an `onOverride` handler that refetches the application data.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `OverridePayload` type and `submitOverride` function
- `src/components/override-panel.tsx` — new file
- `src/routes/applications/$id/index.tsx` — import and render override panel

## Done when

- `npx tsc --noEmit` exits clean
- Override panel renders with a Dialog containing decision select, reason textarea, and submit button
- Submit is disabled when reason is under 20 characters
- `submitOverride` has mock-data fallback (returns success after delay)
- Toast shows on success/error
- `onOverride` callback fires after successful submission
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button has a working handler
