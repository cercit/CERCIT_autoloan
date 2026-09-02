# Task 70 — Dashboard: portfolio quality metrics

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a portfolio quality section to the dashboard showing risk distribution (pie chart) and key metrics: average CIBIL score, average FOIR, average LTV, and NPA prediction rate.

## Current state

- `src/routes/dashboard.tsx` renders the dashboard with summary cards and charts
- Recharts is already installed (PieChart, Cell, ResponsiveContainer available)
- `src/lib/api.ts` has dashboard functions
- `src/components/app-shell.tsx` exports `SectionCard`, `LabelValue`
- Decision trend chart was added in task 69

## Steps

### 1. Add `getPortfolioMetrics` to `src/lib/api.ts`

```typescript
export type PortfolioMetrics = {
  avgCibilScore: number;
  avgFoir: number;
  avgLtv: number;
  npaPredictionRate: number;
  riskDistribution: { name: string; value: number; color: string }[];
};

export async function getPortfolioMetrics(): Promise<PortfolioMetrics> {
  if (!isSupabaseConfigured) {
    return {
      avgCibilScore: 712,
      avgFoir: 42.3,
      avgLtv: 78.5,
      npaPredictionRate: 3.2,
      riskDistribution: [
        { name: "Low Risk", value: 62, color: "#22c55e" },
        { name: "Medium Risk", value: 25, color: "#eab308" },
        { name: "High Risk", value: 13, color: "#ef4444" },
      ],
    };
  }

  const { data, error } = await supabase
    .from("applications")
    .select("cibil_score, foir, ltv_ex_showroom")
    .in("status", ["APPROVED", "DISBURSED"]);

  if (error || !data || data.length === 0) {
    return {
      avgCibilScore: 0, avgFoir: 0, avgLtv: 0, npaPredictionRate: 0,
      riskDistribution: [],
    };
  }

  const rows = data as any[];
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const scores = rows.map((r) => r.cibil_score ?? 0).filter((v) => v > 0);
  const foirs = rows.map((r) => r.foir ?? 0).filter((v) => v > 0);
  const ltvs = rows.map((r) => r.ltv_ex_showroom ?? 0).filter((v) => v > 0);

  const low = rows.filter((r) => (r.cibil_score ?? 0) >= 750).length;
  const high = rows.filter((r) => (r.cibil_score ?? 0) < 650).length;
  const med = rows.length - low - high;

  return {
    avgCibilScore: Math.round(avg(scores)),
    avgFoir: Math.round(avg(foirs) * 10) / 10,
    avgLtv: Math.round(avg(ltvs) * 10) / 10,
    npaPredictionRate: Math.round((high / rows.length) * 100 * 10) / 10,
    riskDistribution: [
      { name: "Low Risk", value: low, color: "#22c55e" },
      { name: "Medium Risk", value: med, color: "#eab308" },
      { name: "High Risk", value: high, color: "#ef4444" },
    ],
  };
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/portfolio-quality.tsx`

Build a component that:
- Takes `metrics: PortfolioMetrics` as a prop
- Renders a grid: left side has 4 `LabelValue` cards (avg CIBIL, avg FOIR, avg LTV, NPA prediction rate), right side has a Recharts `PieChart` with risk distribution
- Pie chart uses the colors from `riskDistribution` items
- Include a Recharts `Legend` and `Tooltip`

Run `npx tsc --noEmit`.

### 3. Add to `src/routes/dashboard.tsx`

Import `getPortfolioMetrics` and `PortfolioQuality`. Fetch in `useEffect`, render inside a `SectionCard` titled "Portfolio quality" after the decision trend chart.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `PortfolioMetrics` type and `getPortfolioMetrics` function
- `src/components/portfolio-quality.tsx` — new file
- `src/routes/dashboard.tsx` — import and render portfolio quality section

## Done when

- `npx tsc --noEmit` exits clean
- Four metric cards render with formatted values
- Pie chart renders with three risk segments (Low/Medium/High)
- `getPortfolioMetrics` has mock-data fallback
- Chart has tooltip and legend
- Section appears on the dashboard
- No `// # reason:` or `// Self-review` comments in any edited file
