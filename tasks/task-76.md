# Task 76 — Loading skeleton components

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add loading skeleton placeholders to key pages so they show structured placeholder content while data is being fetched, instead of a blank screen or a spinner.

## Current state

- shadcn's `Skeleton` component exists at `src/components/ui/skeleton.tsx`
- Pages fetch data in `useEffect` and show nothing (or the page shell) while loading
- Key pages: dashboard, applications list, application detail
- No loading skeleton pattern exists

## Steps

### 1. Create `src/components/skeletons/dashboard-skeleton.tsx`

Build a skeleton that mirrors the dashboard layout:
- 4 summary card skeletons (same grid as dashboard)
- 2 chart area skeletons (rectangular blocks)

Use the shadcn `Skeleton` component:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
```

### 2. Create `src/components/skeletons/applications-skeleton.tsx`

Build a skeleton that mirrors the applications table:
- Header row of skeleton bars
- 8 rows of varying-width skeleton bars

### 3. Create `src/components/skeletons/detail-skeleton.tsx`

Build a skeleton that mirrors the application detail page:
- Top header skeleton (title + status)
- 3 section card skeletons with label-value pairs

### 4. Add skeletons to pages

In each page, add a `loading` state variable (default `true`, set to `false` after data fetch). Render the skeleton when `loading` is true:

```tsx
if (loading) return <AppShell title="Dashboard"><DashboardSkeleton /></AppShell>;
```

Run `npx tsc --noEmit` after each file.

## Files to edit

- `src/components/skeletons/dashboard-skeleton.tsx` — new file
- `src/components/skeletons/applications-skeleton.tsx` — new file
- `src/components/skeletons/detail-skeleton.tsx` — new file
- `src/routes/dashboard.tsx` — add loading state and skeleton
- `src/routes/applications/index.tsx` — add loading state and skeleton
- `src/routes/applications/$id/index.tsx` — add loading state and skeleton

## Done when

- `npx tsc --noEmit` exits clean
- Three skeleton components render structured placeholder content
- Dashboard shows card + chart skeletons while loading
- Applications list shows table skeleton while loading
- Application detail shows section skeletons while loading
- Skeletons use the shadcn `Skeleton` component
- No `// # reason:` or `// Self-review` comments in any edited file
