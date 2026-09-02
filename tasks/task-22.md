# Task 22 — Wire toast notifications using sonner

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

The `sonner` package is already installed and a `Toaster` component exists at `src/components/ui/sonner.tsx`, but it's not rendered anywhere. Wire it into the app and add toast calls to key user actions.

## Current state

- `src/components/ui/sonner.tsx` exports `Toaster` (wraps sonner's `Toaster` with project styling)
- `src/routes/__root.tsx` has `RootComponent` (line ~138) that renders `<QueryClientProvider><Outlet /></QueryClientProvider>` — no `Toaster` rendered
- `src/components/copilot-review.tsx` has `handleDecisionSubmit()` that submits officer decisions — currently shows result in a dialog but nothing on error
- `src/routes/applications/new.tsx` has form submission via `submitFullApplication()` — currently shows result in a dialog

## Steps

### 1. Render `<Toaster />` in `__root.tsx`

In `RootComponent` (around line 138), import `Toaster` from `@/components/ui/sonner` and render it as a sibling to `<Outlet />`:

```tsx
import { Toaster } from "@/components/ui/sonner";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
```

### 2. Add toast to officer decision in `copilot-review.tsx`

Import `toast` from `sonner` (NOT from the ui component — the function import is `import { toast } from "sonner"`).

In `handleDecisionSubmit()`, after the `submitOfficerDecision` call:
- If `res` is not null: `toast.success("Decision recorded: " + res.decision)`
- If `res` is null and `isSupabaseConfigured` is false: no toast needed (demo mode, dialog handles it)
- On catch/error: `toast.error("Failed to submit decision")`

### 3. Add toast to form submission in `new.tsx`

Import `toast` from `sonner`.

In the submit handler (look for the `submitFullApplication` call):
- On success: `toast.success("Application submitted: " + result.applicationId)`
- On error: `toast.error("Submission failed — please try again")`

## Files to edit

- `src/routes/__root.tsx` — add `<Toaster />` import and render
- `src/components/copilot-review.tsx` — add `toast` import and calls
- `src/routes/applications/new.tsx` — add `toast` import and calls

## Done when

- `npx tsc --noEmit` exits clean
- `<Toaster />` renders inside `RootComponent`
- `toast` from `sonner` is imported and called in both copilot-review.tsx and new.tsx
- No `// # reason:` or `// Self-review` comments in any edited file
