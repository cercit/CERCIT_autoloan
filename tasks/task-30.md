# Task 30 — Session timeout with auto-logout warning

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a 15-minute inactivity timer. Show a warning dialog at 13 minutes, then auto-logout at 15 minutes.

## Current state

- `src/lib/auth.ts` exports `signOut()` — call this to log out
- `src/lib/supabase.ts` exports `isSupabaseConfigured` — skip timeout in demo mode
- `src/components/app-shell.tsx` has `AppShell` component used by all authenticated pages
- No hooks directory exists at `src/hooks/` — create it
- The app uses `Dialog` from `@/components/ui/dialog` (already installed)

## Steps

### 1. Create `src/hooks/use-session-timeout.ts`

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";

const TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_MS = 13 * 60 * 1000;

export function useSessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimers = useCallback(() => {
    if (!isSupabaseConfigured) return;
    setShowWarning(false);
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);
    warningRef.current = setTimeout(() => setShowWarning(true), WARNING_MS);
    timerRef.current = setTimeout(async () => {
      const { signOut } = await import("@/lib/auth");
      await signOut();
      window.location.href = "/";
    }, TIMEOUT_MS);
  }, []);

  const dismissWarning = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    const handler = () => resetTimers();
    events.forEach((e) => window.addEventListener(e, handler));
    resetTimers();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
    };
  }, [resetTimers]);

  return { showWarning, dismissWarning };
}
```

Note: uses `window.location.href = "/"` instead of `useNavigate` to avoid the hook needing router context. `signOut()` is dynamically imported to avoid circular dependency.

Run `npx tsc --noEmit` after creating this file.

### 2. Add warning dialog to `src/components/app-shell.tsx`

Import the hook and Dialog components at the top of the file:

```typescript
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
```

Inside the `AppShell` function (it already has `const [sidebarOpen, setSidebarOpen] = useState(false)` at line ~93), add:

```typescript
const { showWarning, dismissWarning } = useSessionTimeout();
```

At the bottom of the return JSX (just before the closing `</div>` of the root element), add the dialog:

```tsx
<Dialog open={showWarning} onOpenChange={(open) => { if (!open) dismissWarning(); }}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Session expiring</DialogTitle>
      <DialogDescription>
        You've been inactive for a while. Your session will end in 2 minutes.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button onClick={dismissWarning}>Stay signed in</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Run `npx tsc --noEmit` after this change.

## Files to edit

- `src/hooks/use-session-timeout.ts` — new file (create `src/hooks/` directory)
- `src/components/app-shell.tsx` — import hook + Dialog, render warning

## Done when

- `npx tsc --noEmit` exits clean
- `useSessionTimeout` hook exists and returns `{ showWarning, dismissWarning }`
- The hook skips all timers when `isSupabaseConfigured` is false (demo mode)
- `AppShell` renders a `Dialog` controlled by `showWarning`
- "Stay signed in" button calls `dismissWarning()` which resets the timers
- Auto-logout after 15 minutes calls `signOut()` and redirects to `/`
- No `// # reason:` or `// Self-review` comments in any edited file
