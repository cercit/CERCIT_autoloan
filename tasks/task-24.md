# Task 24 — Audit log clickable application IDs and resolved user names

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

The audit log shows application IDs as plain text and user names as "System" or "Unknown". Make the application IDs clickable links, and resolve real user names from the `users` table.

## Current state

File: `src/lib/api.ts` — `getMappedAuditLog()` function:
- Queries `audit_events` table
- Maps `actor_type === "SYSTEM"` to "System", everything else to "Unknown"
- Returns `{ app, action, user, time, detail }` objects
- The `audit_events` table has `actor_id` (UUID referencing users.user_id) and `actor_type` ("SYSTEM" or "USER")

File: `src/routes/audit-log.tsx`:
- Already imports `Link` from `@tanstack/react-router`
- Renders `entry.app` as plain text in a table cell
- Renders `entry.user` as plain text

## Steps

### 1. Update `getMappedAuditLog()` in `src/lib/api.ts`

After fetching audit events, resolve user names:

```typescript
// Collect unique actor_ids that are USER type
const userActorIds = [...new Set(
  (data as any[])
    .filter((e) => e.actor_type === "USER" && e.actor_id)
    .map((e) => e.actor_id as string)
)];

// Fetch user names in one query
let userMap: Record<string, string> = {};
if (userActorIds.length > 0) {
  const { data: users } = await supabase
    .from("users")
    .select("user_id, full_name")
    .in("user_id", userActorIds);
  if (users) {
    for (const u of users as any[]) {
      userMap[u.user_id] = u.full_name ?? "Unknown user";
    }
  }
}
```

Then in the existing map, change the `user` field:
- If `actor_type === "SYSTEM"`: `"System"`
- Else: `userMap[row.actor_id] ?? "Unknown user"`

### 2. Make application IDs clickable in `audit-log.tsx`

Find the table cell that renders `entry.app`. Replace it so that if the value looks like an ID (non-empty and not "—"), it's a link:

```tsx
<td className="...existing classes...">
  {entry.app && entry.app !== "—" ? (
    <Link to="/applications/$id" params={{ id: entry.app }} className="text-primary hover:underline">
      {entry.app}
    </Link>
  ) : (
    entry.app
  )}
</td>
```

`Link` is already imported in this file.

## Files to edit

- `src/lib/api.ts` — resolve user names in `getMappedAuditLog()`
- `src/routes/audit-log.tsx` — make app IDs clickable

## Done when

- `npx tsc --noEmit` exits clean
- `getMappedAuditLog()` does a second query to `users` table to resolve `actor_id` to `full_name`
- Application IDs in the audit log table are `<Link>` elements pointing to `/applications/$id`
- No `// # reason:` or `// Self-review` comments in either file
