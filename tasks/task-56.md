# Task 56 — SLA timer display

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create `src/components/sla-timer.tsx` — a component that displays time elapsed since an application was submitted, with color-coded urgency. Add it to the application detail page header area.

## Current state

- `src/routes/applications/$id/index.tsx` renders the application detail page
- `Application.submitted` is a string like `"28 Aug 2026"` — this is the formatted date from mock data
- No SLA tracking exists in the UI
- `cn()` is available from `@/lib/utils` for class merging
- `lucide-react` has `Clock` and `AlertTriangle` icons

## Steps

### 1. Create `src/components/sla-timer.tsx`

```typescript
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SlaTimer({
  submittedAt,
  targetHours = 8,
}: {
  submittedAt: string;
  targetHours?: number;
}) {
  const submitted = new Date(submittedAt);
  if (isNaN(submitted.getTime())) {
    return null;
  }

  const now = new Date();
  const elapsedMs = now.getTime() - submitted.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  const display = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const ratio = elapsedHours / targetHours;
  const overdue = ratio > 1;
  const approaching = ratio > 0.75;

  const tone = overdue
    ? "text-destructive"
    : approaching
      ? "text-warning"
      : "text-success";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium tabular", tone)}>
      {overdue ? (
        <AlertTriangle className="size-4" />
      ) : (
        <Clock className="size-4" />
      )}
      {display}
      {overdue && <span className="text-xs font-semibold uppercase tracking-wide">Overdue</span>}
    </span>
  );
}
```

Run `npx tsc --noEmit`.

### 2. Add `SlaTimer` to the application detail page

In `src/routes/applications/$id/index.tsx`, import the component:

```typescript
import { SlaTimer } from "@/components/sla-timer";
```

The `app.submitted` field is a formatted string like `"28 Aug 2026"` — `new Date("28 Aug 2026")` parses correctly in modern browsers. Add the timer in the subtitle area of `AppShell`, or just above the `CopilotReview` component:

```tsx
<div className="mb-4 flex items-center gap-4">
  <span className="text-sm text-muted-foreground">SLA:</span>
  <SlaTimer submittedAt={app.submitted} targetHours={8} />
</div>
```

Place this between the `<AppShell>` opening and the `<CopilotReview>` component.

Run `npx tsc --noEmit`.

## Files to edit

- `src/components/sla-timer.tsx` — new file
- `src/routes/applications/$id/index.tsx` — import and render `SlaTimer`

## Done when

- `npx tsc --noEmit` exits clean
- `SlaTimer` accepts `submittedAt: string` and optional `targetHours: number` (default 8)
- Displays elapsed time as "Xh Ym" format
- Green when under 75% of target
- Amber when 75-100% of target
- Red with "OVERDUE" label when past target
- Returns null gracefully if `submittedAt` is not a valid date
- Component appears on the application detail page
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new data field resolves from its source, not a hardcoded fallback
