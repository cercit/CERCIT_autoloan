# Task 75 — Empty states for all list views

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add proper empty state illustrations and messaging to all list views when there's no data. Replace blank white space with a centered message, icon, and action button.

## Current state

- `src/routes/applications/index.tsx` — applications list (may show empty table)
- `src/routes/audit-log.tsx` — audit log list
- `src/routes/employers.tsx` — employer list
- `src/routes/users.tsx` — user list
- `src/routes/policy-rules.tsx` — policy rules list
- `src/components/document-list.tsx` — document list on application detail
- No consistent empty state pattern exists

## Steps

### 1. Create `src/components/empty-state.tsx`

Build a reusable component:
- Takes `icon: LucideIcon`, `title: string`, `description: string`, and optional `action: { label: string; onClick: () => void }` as props
- Renders: centered layout with the icon (size-12, muted color), title (text-lg font-medium), description (text-sm text-muted-foreground), and an optional action `Button`
- Use `cn()` for className merging, accept additional `className` prop

### 2. Add empty states to each list view

For each page, wrap the list/table rendering in a conditional:

```tsx
{items.length === 0 ? (
  <EmptyState
    icon={FileText}
    title="No applications yet"
    description="Applications will appear here once submitted."
    action={{ label: "New Application", onClick: () => navigate({ to: "/applications/new" }) }}
  />
) : (
  // existing table/list
)}
```

Appropriate icons and messages per page:
- Applications: `FileText`, "No applications yet"
- Audit log: `History`, "No audit events recorded"
- Employers: `Building2`, "No employers added"
- Users: `Users`, "No users found"
- Policy rules: `Scale`, "No policy rules configured"
- Document list: `Upload`, "No documents uploaded"

Run `npx tsc --noEmit` after each file.

## Files to edit

- `src/components/empty-state.tsx` — new file
- `src/routes/applications/index.tsx` — add empty state
- `src/routes/audit-log.tsx` — add empty state
- `src/routes/employers.tsx` — add empty state
- `src/routes/users.tsx` — add empty state
- `src/routes/policy-rules.tsx` — add empty state
- `src/components/document-list.tsx` — add empty state

## Done when

- `npx tsc --noEmit` exits clean
- `EmptyState` component renders icon, title, description, and optional action button
- All six list views show a meaningful empty state instead of blank space
- Icons are imported from `lucide-react`
- Action buttons navigate to the correct creation page where applicable
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button has a working handler
