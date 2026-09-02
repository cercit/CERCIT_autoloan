# Task 54 — Status transition buttons on application detail

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

On the application detail page, show contextual action buttons based on current status. Each button triggers a valid status transition, calls `transitionStatus`, and refreshes the page. The buttons change depending on the application's current status.

## Current state

- `src/routes/applications/$id/index.tsx` renders `ApplicationDetail` component
  - Loads application via `getApplication(id)` into `useState<Application | null>`
  - Renders `<CopilotReview app={app} />`, `<DocumentList>`, `<OfficerNotes>`
  - No status transition UI exists
- `src/lib/api.ts` exports `transitionStatus(applicationId, from, to)` (task 53)
- `src/lib/workflow.ts` exports `getAvailableTransitions(status)` (task 53)
- `src/lib/mock-data.ts` defines `AppStatus` type

## Steps

### 1. Import dependencies in `src/routes/applications/$id/index.tsx`

```typescript
import { getAvailableTransitions } from "@/lib/workflow";
import { transitionStatus } from "@/lib/api";
import type { AppStatus } from "@/lib/mock-data";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
```

### 2. Add state for the transition in progress

```typescript
const [transitioning, setTransitioning] = useState(false);
```

### 3. Add a transition handler

```typescript
async function handleTransition(to: AppStatus) {
  if (!app) return;
  setTransitioning(true);
  const result = await transitionStatus(app.id, app.status, to);
  if (result.success) {
    toast.success(`Status changed to ${to}`);
    const refreshed = await getApplication(id);
    setApp(refreshed ?? null);
  } else {
    toast.error(result.error ?? "Transition failed");
  }
  setTransitioning(false);
}
```

### 4. Render transition buttons

Below the `<AppShell>` opening (in the `actions` prop or inside the shell), render buttons based on available transitions. Map each target status to a button label and variant:

```typescript
const transitionLabels: Partial<Record<AppStatus, { label: string; variant: "default" | "destructive" | "outline" }>> = {
  "Documents Uploaded": { label: "Mark Documents Uploaded", variant: "outline" },
  "Under Review": { label: "Run Assessment", variant: "default" },
  "Referred": { label: "Refer", variant: "outline" },
  "Sanctioned": { label: "Approve", variant: "default" },
  "Rejected": { label: "Reject", variant: "destructive" },
};
```

Render in the `actions` area of `AppShell`:

```tsx
actions={
  <div className="flex flex-wrap items-center gap-2">
    {getAvailableTransitions(app.status).map((target) => {
      const config = transitionLabels[target];
      if (!config) return null;
      return (
        <Button
          key={target}
          variant={config.variant}
          disabled={transitioning}
          onClick={() => handleTransition(target)}
        >
          {transitioning ? <Loader2 className="size-4 animate-spin" /> : null}
          {config.label}
        </Button>
      );
    })}
    <Button variant="outline" asChild>
      <Link to="/applications/$id/manager-review" params={{ id: app.id }}>
        <UserCog className="size-4" /> Manager view
      </Link>
    </Button>
  </div>
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/routes/applications/$id/index.tsx` — add imports, state, handler, and transition buttons

## Done when

- `npx tsc --noEmit` exits clean
- "New" status shows "Mark Documents Uploaded" button
- "Documents Uploaded" shows "Run Assessment" button
- "Under Review" shows "Approve", "Reject", "Refer" buttons
- "Sanctioned" and "Rejected" show no transition buttons (terminal states)
- Clicking a button calls `transitionStatus`, shows a toast, and refreshes the application data
- Buttons are disabled while a transition is in progress
- The existing "Manager view" button is preserved
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/link has a working handler
- Every new data field resolves from its source, not a hardcoded fallback
