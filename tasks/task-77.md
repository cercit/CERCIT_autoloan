# Task 77 — Keyboard shortcuts

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add keyboard shortcuts for common actions: Ctrl+K to open search, Ctrl+N for new application, Escape to close dialogs. Show a shortcut hint overlay when the user presses "?".

## Current state

- `src/routes/applications/new.tsx` — new application form
- `src/routes/applications/index.tsx` — applications list with search
- `src/components/app-shell.tsx` — main layout
- No keyboard shortcuts exist

## Steps

### 1. Create `src/hooks/use-keyboard-shortcuts.ts`

Build a custom hook:
- Takes a map of key combinations to callbacks
- Registers `keydown` event listeners on `document`
- Handles modifier keys (Ctrl/Cmd)
- Cleans up on unmount
- Ignores shortcuts when user is typing in an input/textarea

```typescript
import { useEffect } from "react";

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const key = [
        e.ctrlKey || e.metaKey ? "mod" : "",
        e.shiftKey ? "shift" : "",
        e.key.toLowerCase(),
      ].filter(Boolean).join("+");

      const cb = shortcuts[key];
      if (cb) { e.preventDefault(); cb(); }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
```

### 2. Create `src/components/shortcut-overlay.tsx`

Build a component that:
- Shows when `visible` prop is true
- Renders a centered modal overlay listing all shortcuts
- Each shortcut shows the key combination (in a `<kbd>` styled element) and the action description
- Close with Escape or clicking outside

Shortcuts to display:
- `Ctrl+K` — Search applications
- `Ctrl+N` — New application
- `Escape` — Close dialog
- `?` — Show shortcuts

### 3. Wire shortcuts in `src/components/app-shell.tsx`

Import `useKeyboardShortcuts` and register the shortcuts:
- `mod+k` — focus the search input (if search exists) or navigate to applications
- `mod+n` — navigate to `/applications/new`
- `?` — toggle shortcut overlay visibility

Add `<ShortcutOverlay>` at the bottom of the AppShell component.

Run `npx tsc --noEmit`.

## Files to edit

- `src/hooks/use-keyboard-shortcuts.ts` — new file
- `src/components/shortcut-overlay.tsx` — new file
- `src/components/app-shell.tsx` — import and wire shortcuts + overlay

## Done when

- `npx tsc --noEmit` exits clean
- `Ctrl+N` navigates to new application form
- `?` toggles the shortcut overlay
- Shortcuts are ignored when typing in inputs
- Shortcut overlay lists all shortcuts with styled `<kbd>` elements
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button has a working handler
