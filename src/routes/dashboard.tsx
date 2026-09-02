import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, TrendingUp, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ZAxis,
} from "recharts";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApplications, getDashboardStats, getDashboardTat } from "@/lib/api";
import { tatData } from "@/lib/mock-data";
import type { DashboardStats } from "@/lib/api";
import type { Application } from "@/lib/mock-data";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — cercit Credit Ops" },
      {
        name: "description",
        content:
          "Daily credit workload at a glance: application queue, decision distribution and turnaround time for vehicle loan underwriting.",
      },
      { property: "og:title", content: "Dashboard — cercit Credit Ops" },
      {
        property: "og:description",
        content: "Application queue, decision mix and turnaround time for vehicle loan underwriting.",
      },
    ],
  }),
  component: Dashboard,
});

const decisionSlices = [
  { name: "AI-Approved (STP)", key: "approved", color: "var(--color-success)" },
  { name: "Manual Review", key: "pending", color: "var(--color-warning)" },
  { name: "Rejected", key: "rejected", color: "var(--color-destructive)" },
] as const;

const flagReasons: Record<string, string> = {
  "APP-2026-00847": "DTI Volatility",
  "APP-2026-00846": "LTV Erosion Risk",
  "APP-2026-00845": "Income Verification",
  "APP-2026-00844": "Employment Tenure",
  "APP-2026-00843": "High FPD Risk Score",
  "APP-2026-00842": "Valuation Mismatch",
};

const aiConfidence: Record<string, number> = {
  "APP-2026-00847": 68,
  "APP-2026-00846": 42,
  "APP-2026-00845": 55,
  "APP-2026-00844": 71,
  "APP-2026-00843": 38,
  "APP-2026-00842": 62,
};

const dealerLtv = [
  { dealer: "Sri Lakshmi Auto", ltv: 88, volume: 12, risk: "high" },
  { dealer: "VST Grandeur", ltv: 82, volume: 35, risk: "med" },
  { dealer: "Khivraj Motors", ltv: 72, volume: 65, risk: "low" },
  { dealer: "Capital Honda", ltv: 65, volume: 20, risk: "low" },
  { dealer: "Olympia Motors", ltv: 78, volume: 40, risk: "low" },
  { dealer: "Kun Exclusive", ltv: 70, volume: 25, risk: "med" },
];

function rangeToDate(r: string): string | undefined {
  const now = new Date();
  if (r === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (r === "week") { const d = new Date(now); d.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); return d.toISOString(); }
  if (r === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (r === "30d") return new Date(now.getTime() - 30 * 86400000).toISOString();
  return undefined;
}

function Dashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0, pending: 0, approved: 0, rejected: 0, stpRate: 0, fpdRisk: 0, totalTrend: 0,
  });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30d");
  const [tatDataFetched, setTatDataFetched] = useState<any[]>([]);
  const [activeSlice, setActiveSlice] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const from = rangeToDate(range);
    Promise.all([
      getApplications().then(setApplications),
      getDashboardStats(from).then(setStats),
      (from ? getDashboardTat(from) : Promise.resolve(tatData)).then(setTatDataFetched),
    ]).finally(() => setLoading(false));
  }, [range]);

  const total = stats.approved + stats.pending + stats.rejected;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Wednesday workload — Chennai Region"
      actions={
        <Button asChild>
          <Link to="/applications/new">
            <Plus className="size-4" /> New application
          </Link>
        </Button>
      }
    >
      {/* Metric cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="panel p-5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))
        ) : (
          <>
            <div className="panel p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total applications
                </p>
                {stats.totalTrend > 0 && (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-success">
                    <TrendingUp className="size-3.5" />+{stats.totalTrend}%
                  </span>
                )}
              </div>
              <p className="mt-2 text-3xl font-bold tabular tracking-tight">
                {stats.total.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">this week</p>
            </div>

            <div className="panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                STP rate
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-bold tabular tracking-tight">{stats.stpRate}%</p>
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  Target: 80%
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Straight-through processing</p>
            </div>

            <div className="panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pending exceptions
              </p>
              <p className="mt-2 text-3xl font-bold tabular tracking-tight text-warning">
                {stats.pending}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">AI-flagged for manual review</p>
            </div>

            <div className="panel p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  FPD risk
                </p>
                <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
                  <AlertTriangle className="size-3.5" />Elevated
                </span>
              </div>
              <p className="mt-2 text-3xl font-bold tabular tracking-tight">{stats.fpdRisk}%</p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Projected first payment default</p>
            </div>
          </>
        )}
      </div>

      {/* Exception queue */}
      <SectionCard
        title="Exception Queue"
        description="AI-flagged files requiring senior review"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/applications">View all</Link>
          </Button>
        }
        className="mt-4 overflow-hidden"
      >
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="sticky top-0 bg-surface-subtle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Application</th>
                <th className="px-4 py-2.5 text-left font-medium">Applicant</th>
                <th className="px-4 py-2.5 text-left font-medium">Dealer / Source</th>
                <th className="px-4 py-2.5 text-right font-medium">Loan Amount</th>
                <th className="px-4 py-2.5 text-center font-medium">AI Confidence</th>
                <th className="px-4 py-2.5 text-left font-medium">Flag Reason</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const conf = aiConfidence[app.id] ?? 50;
                const confTone = conf < 50 ? "destructive" : "warning";
                return (
                  <tr key={app.id} className="border-t border-border transition-colors hover:bg-surface-subtle/60">
                    <td className="px-4 py-3">
                      <Link
                        to="/applications/$id"
                        params={{ id: app.id }}
                        className="font-medium whitespace-nowrap text-primary tabular hover:underline"
                      >
                        {app.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{app.name}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <CategoryBadge category={app.category} />
                        {app.dealer.split(",")[0]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular font-medium">
                      {inr(app.loanAmount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-block rounded px-2.5 py-1 text-xs font-bold tabular",
                        confTone === "destructive"
                          ? "bg-destructive/12 text-destructive"
                          : "bg-warning/18 text-warning-foreground dark:text-warning",
                      )}>
                        {conf}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-[13px]">
                      {flagReasons[app.id] ?? app.flags[0] ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Charts row */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* Decision distribution */}
        <SectionCard title="Decision Distribution" description="This month">
          <div className="relative mx-auto h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={decisionSlices.map((s) => ({
                    name: s.name,
                    value: stats[s.key],
                  }))}
                  dataKey="value"
                  innerRadius="60%"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setActiveSlice(i)}
                  onMouseLeave={() => setActiveSlice(null)}
                >
                  {decisionSlices.map((s, i) => (
                    <Cell
                      key={s.key}
                      fill={s.color}
                      opacity={activeSlice != null && activeSlice !== i ? 0.35 : 1}
                      style={{ transition: "opacity 150ms", cursor: "default" }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {(() => {
                const slice = activeSlice != null ? decisionSlices[activeSlice] : undefined;
                return slice ? (
                  <>
                    <span className="text-2xl font-bold tabular">{stats[slice.key]}</span>
                    <span className="text-[11px] text-muted-foreground">{slice.name}</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold tabular">{total.toLocaleString()}</span>
                    <span className="text-[11px] text-muted-foreground">applications</span>
                  </>
                );
              })()}
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {decisionSlices.map((s) => (
              <li key={s.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular text-muted-foreground">
                  <span className="mr-1.5 font-medium text-foreground">{stats[s.key].toLocaleString()}</span>
                  {total > 0 ? ((stats[s.key] / total) * 100).toFixed(1) : "0.0"}%
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* LTV vs dealer scatter */}
        <SectionCard title="LTV vs Dealer Performance" description="Risk concentration by source (last 30 days)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                <XAxis
                  dataKey="volume"
                  type="number"
                  name="Volume"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  label={{
                    value: "Application Volume",
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 11,
                    fill: "var(--color-muted-foreground)",
                  }}
                />
                <YAxis
                  dataKey="ltv"
                  type="number"
                  name="LTV"
                  domain={[50, 95]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  unit="%"
                />
                <ZAxis dataKey="volume" range={[80, 400]} />
                <ReferenceLine
                  y={75}
                  stroke="var(--color-success)"
                  strokeDasharray="4 4"
                  label={{
                    value: "Target Max 75%",
                    position: "insideTopRight",
                    fill: "var(--color-success)",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: "oklch(0.235 0.026 264)",
                    border: "1px solid oklch(0.35 0.02 264)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  itemStyle={{ color: "oklch(0.965 0.006 248)" }}
                  labelStyle={{ color: "oklch(0.965 0.006 248)" }}
                  formatter={(value: number, name: string) => {
                    if (name === "LTV") return [`${value}%`, "LTV"];
                    return [value, name];
                  }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.dealer ?? "";
                  }}
                />
                <Scatter
                  data={dealerLtv.filter((d) => d.risk === "high")}
                  fill="var(--color-destructive)"
                  isAnimationActive={false}
                />
                <Scatter
                  data={dealerLtv.filter((d) => d.risk === "med")}
                  fill="var(--color-warning)"
                  isAnimationActive={false}
                />
                <Scatter
                  data={dealerLtv.filter((d) => d.risk === "low")}
                  fill="var(--color-success)"
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
