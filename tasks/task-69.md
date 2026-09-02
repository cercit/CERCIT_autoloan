# Task 69 — Dashboard: decision trend chart

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a decision trend line chart to the dashboard showing approve/reject/review counts over the last 30 days. Use Recharts (already installed).

## Current state

- `src/routes/dashboard.tsx` renders the dashboard with summary cards and existing charts
- Recharts is already installed and used elsewhere in the project
- `src/lib/api.ts` has dashboard-related functions
- `src/lib/mock-data.ts` has mock data patterns
- No decision trend chart exists

## Steps

### 1. Add `getDecisionTrend` to `src/lib/api.ts`

```typescript
export type DecisionTrendPoint = {
  date: string;
  approved: number;
  rejected: number;
  review: number;
};

export async function getDecisionTrend(): Promise<DecisionTrendPoint[]> {
  if (!isSupabaseConfigured) {
    const points: DecisionTrendPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      points.push({
        date: d.toISOString().slice(0, 10),
        approved: Math.floor(Math.random() * 15) + 5,
        rejected: Math.floor(Math.random() * 5) + 1,
        review: Math.floor(Math.random() * 8) + 2,
      });
    }
    return points;
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from("applications")
    .select("status, updated_at")
    .gte("updated_at", since.toISOString())
    .in("status", ["APPROVED", "REJECTED", "REVIEW"]);

  if (error || !data) return [];

  const byDate = new Map<string, DecisionTrendPoint>();
  for (const row of data as any[]) {
    const date = (row.updated_at as string).slice(0, 10);
    const existing = byDate.get(date) ?? { date, approved: 0, rejected: 0, review: 0 };
    if (row.status === "APPROVED") existing.approved++;
    else if (row.status === "REJECTED") existing.rejected++;
    else existing.review++;
    byDate.set(date, existing);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/decision-trend-chart.tsx`

Build a component that:
- Takes `data: DecisionTrendPoint[]` as a prop
- Renders a Recharts `LineChart` with `ResponsiveContainer`
- Three lines: Approved (green), Rejected (red), Review (amber/yellow)
- X-axis: date (formatted as "DD MMM")
- Y-axis: count
- Tooltip showing all three values on hover
- Legend at the bottom

Run `npx tsc --noEmit`.

### 3. Add the chart to `src/routes/dashboard.tsx`

Import `getDecisionTrend` and `DecisionTrendChart`. Fetch data in a `useEffect`, store in state. Render inside a `SectionCard` titled "Decision trend (30 days)" after the existing charts.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `DecisionTrendPoint` type and `getDecisionTrend` function
- `src/components/decision-trend-chart.tsx` — new file
- `src/routes/dashboard.tsx` — import and render trend chart

## Done when

- `npx tsc --noEmit` exits clean
- Line chart renders with three colored lines (approved/rejected/review)
- `getDecisionTrend` has mock-data fallback with 30 days of random data
- Chart has tooltip, legend, and formatted axis labels
- Chart appears on the dashboard page
- No `// # reason:` or `// Self-review` comments in any edited file
