# Task 68 — Application timeline component

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create a visual timeline component showing all stages an application has gone through with timestamps and actors. Add it to the application detail page.

## Current state

- `src/routes/applications/$id/index.tsx` renders the application detail page
- `src/lib/api.ts` has `getMappedAuditLog` which returns audit events with timestamps
- `Application` type has `status` and `createdAt` fields
- No visual timeline exists

## Steps

### 1. Add `getApplicationTimeline` to `src/lib/api.ts`

```typescript
export type TimelineEvent = {
  stage: string;
  timestamp: string;
  actor: string;
  detail: string;
};

export async function getApplicationTimeline(
  applicationId: string
): Promise<TimelineEvent[]> {
  if (!isSupabaseConfigured) {
    return [
      { stage: "Created", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), actor: "System", detail: "Application submitted" },
      { stage: "Documents Uploaded", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), actor: "Applicant", detail: "Salary slip, PAN uploaded" },
      { stage: "Bureau Check", timestamp: new Date(Date.now() - 86400000 * 2 + 3600000).toISOString(), actor: "System", detail: "CIBIL score: 745" },
      { stage: "Auto Assessment", timestamp: new Date(Date.now() - 86400000).toISOString(), actor: "System", detail: "Decision: Approve" },
      { stage: "Pending Review", timestamp: new Date(Date.now() - 3600000).toISOString(), actor: "System", detail: "Awaiting officer review" },
    ];
  }

  const { data, error } = await supabase
    .from("audit_events")
    .select("event_type, created_at, actor_id, details")
    .eq("entity_id", applicationId)
    .eq("entity_type", "APPLICATION")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map((row: any) => ({
    stage: row.event_type,
    timestamp: row.created_at,
    actor: row.actor_id ?? "System",
    detail: typeof row.details === "string" ? row.details : JSON.stringify(row.details ?? {}),
  }));
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/application-timeline.tsx`

Build a component that:
- Takes `events: TimelineEvent[]` as a prop
- Renders a vertical timeline with a line connecting dots
- Each event shows: stage name (bold), timestamp (formatted), actor, and detail text
- Use `relative` time formatting (e.g., "2 days ago") alongside absolute timestamps
- The most recent event gets a pulsing dot indicator
- Use tailwind classes for the timeline styling (no external timeline library)

Run `npx tsc --noEmit`.

### 3. Add `<ApplicationTimeline>` to `src/routes/applications/$id/index.tsx`

Import `getApplicationTimeline` and `ApplicationTimeline`. Fetch the timeline in a `useEffect` and render it inside a `SectionCard` with title "Application Timeline" at the bottom of the page.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `TimelineEvent` type and `getApplicationTimeline` function
- `src/components/application-timeline.tsx` — new file
- `src/routes/applications/$id/index.tsx` — import and render timeline

## Done when

- `npx tsc --noEmit` exits clean
- Timeline renders with connected dots and event details
- `getApplicationTimeline` has mock-data fallback with sample events
- Most recent event has a visual indicator
- Timeline appears at the bottom of the application detail page
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new data field resolves from its source, not a hardcoded fallback
