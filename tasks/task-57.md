# Task 57 — Queue dashboard for officer

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a "My Queue" section to the dashboard below the stat cards. Shows applications assigned to the current user (for now, show all since auth is demo mode). Table includes Application ID (link), Applicant, Status, SLA timer, and Submitted date. Sorted oldest first, max 10 rows, with a "View all" link.

## Current state

- `src/routes/dashboard.tsx` renders stat cards, Application Queue table, Decision Distribution pie, and TAT bar chart
- The "Application Queue" section already shows all applications in a table (lines 147-218)
- `src/lib/mock-data.ts` exports `currentUser` with `name: "Rajeev Menon"`
- `src/lib/api.ts` exports `getOfficerQueue(officerName)` (task 55) — filters applications by assigned officer
- `src/components/sla-timer.tsx` exports `SlaTimer` (task 56)
- `src/components/status.tsx` exports `StatusPill`

## Steps

### 1. Import new dependencies in `src/routes/dashboard.tsx`

```typescript
import { SlaTimer } from "@/components/sla-timer";
import { currentUser } from "@/lib/mock-data";
```

`StatusPill` should already be imported (check line ~18).

### 2. Add the "My Queue" section below stat cards

The existing queue shows all applications. Add a "My Queue" section between the stat cards and the main Application Queue. Filter the already-loaded `applications` array by `currentUser.name`:

```typescript
const myQueue = applications
  .filter((a) => a.assignedTo === currentUser.name)
  .sort((a, b) => new Date(a.submitted).getTime() - new Date(b.submitted).getTime())
  .slice(0, 10);
```

Render after the stat cards grid and before the main two-column layout:

```tsx
{!loading && myQueue.length > 0 && (
  <SectionCard
    title="My Queue"
    description={`${myQueue.length} application${myQueue.length === 1 ? "" : "s"} assigned to you`}
    action={
      <Button variant="ghost" size="sm" asChild>
        <Link to="/applications">View all</Link>
      </Button>
    }
    className="mt-4 overflow-hidden"
  >
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 bg-surface-subtle text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Application</th>
            <th className="px-4 py-2 text-left font-medium">Applicant</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">SLA</th>
            <th className="px-4 py-2 text-left font-medium">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {myQueue.map((a, i) => (
            <tr
              key={a.id}
              className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
            >
              <td className="px-4 py-2.5">
                <Link
                  to="/applications/$id"
                  params={{ id: a.id }}
                  className="font-medium whitespace-nowrap text-primary hover:underline"
                >
                  {a.id}
                </Link>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">{a.name}</td>
              <td className="px-4 py-2.5">
                <StatusPill status={a.status} />
              </td>
              <td className="px-4 py-2.5">
                <SlaTimer submittedAt={a.submitted} targetHours={8} />
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                {a.submitted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </SectionCard>
)}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/routes/dashboard.tsx` — add imports, compute `myQueue`, render "My Queue" section

## Done when

- `npx tsc --noEmit` exits clean
- "My Queue" section appears below stat cards when the current user has assigned applications
- Table shows Application ID (linked), Applicant name, Status pill, SLA timer, and Submitted date
- Applications are sorted oldest first
- Maximum 10 rows displayed
- "View all" button links to `/applications`
- Section is hidden when `myQueue` is empty
- Section is hidden during loading state
- SlaTimer component is used for the SLA column
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/link has a working handler
- Every new data field resolves from its source, not a hardcoded fallback
