# Task 26 — Dashboard date range filter

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

The dashboard shows stats for all time. Add a date range selector so users can view stats for today, this week, this month, last 30 days, or all time.

## Current state

File: `src/routes/dashboard.tsx`

Existing state (around line 52-55): `applications`, `stats`, `tatDataFetched`, `loading`. The `useEffect` calls `getApplications()`, `getDashboardStats()`, and `getDashboardTat()` with no date parameters.

File: `src/lib/api.ts`

`getDashboardStats()` (around line 555) does `supabase.from("applications").select("status")` with no date filter.

`getDashboardTat()` (around line 580) does `supabase.from("applications").select(...)` with no date filter.

## Steps

### 1. Update `getDashboardStats()` in `src/lib/api.ts`

Add optional `from` parameter:

```typescript
export async function getDashboardStats(from?: string) {
  if (!isSupabaseConfigured) {
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
  let query = supabase.from("applications").select("status");
  if (from) query = query.gte("created_at", from);
  const { data, error } = await query;
  // ...rest stays the same
}
```

Do the same for `getDashboardTat()` — add optional `from` parameter and apply `.gte("created_at", from)` if provided.

Run `npx tsc --noEmit` after these changes.

### 2. Add range state and selector in `dashboard.tsx`

Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`.

Add state (near existing state around line 55):

```typescript
const [range, setRange] = useState("30d");
```

Add a helper to compute the `from` date string:

```typescript
function rangeToDate(r: string): string | undefined {
  const now = new Date();
  if (r === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (r === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).toISOString();
  }
  if (r === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (r === "30d") return new Date(now.getTime() - 30 * 86400000).toISOString();
  return undefined; // "all"
}
```

### 3. Pass date to API calls and refetch on range change

Update the `useEffect` to include `range` in its dependency array and pass the computed date:

```typescript
useEffect(() => {
  setLoading(true);
  const from = rangeToDate(range);
  Promise.all([
    getApplications().then(setApplications),
    getDashboardStats(from).then(setStats),
    getDashboardTat(from).then(setTatDataFetched),
  ]).finally(() => setLoading(false));
}, [range]);
```

Note: `getApplications()` stays unfiltered (the queue should always show all apps).

### 4. Render the selector

Above the stat cards row, add a flex container with the range selector:

```tsx
<div className="mb-4 flex items-center gap-3">
  <Select value={range} onValueChange={setRange}>
    <SelectTrigger className="w-44">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="today">Today</SelectItem>
      <SelectItem value="week">This week</SelectItem>
      <SelectItem value="month">This month</SelectItem>
      <SelectItem value="30d">Last 30 days</SelectItem>
      <SelectItem value="all">All time</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Run `npx tsc --noEmit` after all changes.

## Files to edit

- `src/lib/api.ts` — add `from` param to `getDashboardStats()` and `getDashboardTat()`
- `src/routes/dashboard.tsx` — add range state, selector UI, and pass date to API calls

## Done when

- `npx tsc --noEmit` exits clean
- `getDashboardStats(from?)` and `getDashboardTat(from?)` accept optional date filter
- Dashboard has a Select dropdown with 5 range options
- Changing the range refetches stats and TAT data
- No `// # reason:` or `// Self-review` comments in any edited file
