import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, TrendingUp, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";

import { AppShell, Pill, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/api";
import type { DashboardData, DashboardStats } from "@/lib/api";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SlaTimer } from "@/components/sla-timer";
import { DecisionTrendChart } from "@/components/decision-trend-chart";
import { PortfolioQuality } from "@/components/portfolio-quality";
import { ActivityFeed } from "@/components/activity-feed";
import type { FeedItem } from "@/components/activity-feed";
import { getPortfolioMetrics } from "@/lib/api";
import type { PortfolioMetrics } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { eventTitle } from "@/lib/shell-api";

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

function rangeToDate(r: string): string | undefined {
  const now = new Date();
  if (r === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (r === "week") { const d = new Date(now); d.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); return d.toISOString(); }
  if (r === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (r === "30d") return new Date(now.getTime() - 30 * 86400000).toISOString();
  return undefined;
}

const EMPTY_STATS: DashboardStats = {
  total: 0, pending: 0, approved: 0, rejected: 0, stpRate: 0, fpdRisk: null, totalTrend: null, avgProcessingDays: null,
};

function Dashboard() {
  // C10: every figure comes from fn_staff_dashboard (sql/064); nothing on this page is typed in.
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range] = useState("30d");
  const [activeSlice, setActiveSlice] = useState<number | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioMetrics | null>(null);
  const [myName, setMyName] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const from = rangeToDate(range);
    Promise.all([
      getDashboard(from).then(setData).catch((e: Error) => setLoadError(e.message)),
      getPortfolioMetrics().then(setPortfolio),
    ]).finally(() => setLoading(false));
  }, [range]);

  const stats = data?.stats ?? EMPTY_STATS;
  const trendData = data?.trend ?? [];

  const total = stats.approved + stats.pending + stats.rejected;
  const activityItems: FeedItem[] = (data?.activity ?? []).map((e) => {
    const text = eventTitle(e.eventType);
    return {
      id: e.id,
      actor: e.actor,
      action: e.applicationId ? `${text.title} — ${e.applicationId}` : text.title,
      timestamp: e.timestamp,
      type: text.type === "warning" ? "warning" : text.type === "success" ? "success" : "info",
    };
  });

  // Fix A4: today's day and the user's own branch, not a fixed "Wednesday — Chennai".
  const [branch, setBranch] = useState<string | null>(null);
  useEffect(() => {
    void getCurrentUser()
      .then((me) => {
        setBranch(me?.stateCode ?? null);
        setMyName(me?.fullName ?? null);
      })
      .catch(() => setBranch(null));
  }, []);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  const subtitle = `${today} — ${branch ? `${branch} branch` : "all branches"}`;

  return (
    <AppShell
      title="Dashboard"
      subtitle={subtitle}
      actions={
        <Button asChild>
          <Link to="/applications/new">
            <Plus className="size-4" /> New application
          </Link>
        </Button>
      }
    >
      {loadError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The dashboard figures could not be loaded: {loadError}
        </div>
      )}
      {data && data.synthetic > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Includes {data.synthetic.toLocaleString()} synthetic (simulated) applications from the demo book.
        </p>
      )}
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
                {stats.totalTrend != null && stats.totalTrend !== 0 && (
                  <span className={cn("flex items-center gap-0.5 text-xs font-semibold", stats.totalTrend > 0 ? "text-success" : "text-muted-foreground")}>
                    <TrendingUp className="size-3.5" />
                    {stats.totalTrend > 0 ? "+" : ""}
                    {stats.totalTrend}%
                  </span>
                )}
              </div>
              <p className="mt-2 text-3xl font-bold tabular tracking-tight">
                {stats.total.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">sent in the last 30 days</p>
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
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Decided by the system with no person</p>
            </div>

            <div className="panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pending exceptions
              </p>
              <p className="mt-2 text-3xl font-bold tabular tracking-tight text-warning">
                {stats.pending}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Waiting for checks or a person</p>
            </div>

            <div className="panel p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  FPD risk
                </p>
                {stats.fpdRisk != null && stats.fpdRisk >= 2 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
                    <AlertTriangle className="size-3.5" />Elevated
                  </span>
                )}
              </div>
              <p className="mt-2 text-3xl font-bold tabular tracking-tight">{stats.fpdRisk == null ? "—" : `${stats.fpdRisk}%`}</p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                First instalment 30+ days late{data && data.fpdLoans > 0 ? ` (of ${data.fpdLoans} loans)` : ""}
              </p>
            </div>
          </>
        )}
      </div>

      {/* My Queue */}
      <SectionCard
        title="My Queue"
        description={myName ? `Assigned to ${myName}` : "Assigned to you"}
        className="mt-4"
      >
        <ul className="divide-y divide-border">
          {(data?.myQueue ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <Link
                to="/applications/$id"
                params={{ id: a.id }}
                className="text-sm font-medium text-primary hover:underline"
              >
                {a.id} — {a.name}
              </Link>
              <div className="flex items-center gap-3">
                <SlaTimer since={a.since} />
                {a.recommendation && (
                  <Pill
                    tone={
                      a.recommendation === "Approve"
                        ? "success"
                        : a.recommendation === "Maybe"
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {a.recommendation}
                  </Pill>
                )}
              </div>
            </li>
          ))}
          {(data?.myQueue ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No applications in your queue</li>
          )}
        </ul>
      </SectionCard>

      {/* Exception queue */}
      <SectionCard
        title="Exception Queue"
        description="Referred cases waiting for a person, newest first"
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
                <th className="px-4 py-2.5 text-center font-medium">Engine score</th>
                <th className="px-4 py-2.5 text-left font-medium">Rules not met</th>
              </tr>
            </thead>
            <tbody>
              {(data?.exceptions ?? []).map((app) => {
                const conf = app.engineScore;
                const confTone = conf == null || conf < 50 ? "destructive" : "warning";
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
                    <td className="px-4 py-3 whitespace-nowrap">{app.dealer || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular font-medium">
                      {inr(app.loanAmount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {conf == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={cn(
                          "inline-block rounded px-2.5 py-1 text-xs font-bold tabular",
                          confTone === "destructive"
                            ? "bg-destructive/12 text-destructive"
                            : "bg-warning/18 text-warning-foreground dark:text-warning",
                        )}>
                          {conf}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-[13px]">
                      {app.reason || "—"}
                    </td>
                  </tr>
                );
              })}
              {data && data.exceptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No referred cases waiting</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Charts row */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* Decision distribution */}
        <SectionCard title="Decision Distribution" description="Applications sent in the last 30 days">
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

        {/* Application funnel */}
        <SectionCard title="Application Funnel" description="Applications sent in the last 30 days">
          <div className="space-y-3">
            {(data?.funnel ?? []).map((step, i, arr) => {
              const maxCount = arr[0]?.count ?? 1;
              const widthPct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
              const prevCount = i > 0 ? (arr[i - 1]?.count ?? step.count) : step.count;
              const dropPct = prevCount > 0 ? ((prevCount - step.count) / prevCount) * 100 : 0;
              return (
                <div key={step.stage}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{step.stage}</span>
                    <span className="tabular text-muted-foreground">
                      <span className="mr-1.5 font-semibold text-foreground">
                        {step.count.toLocaleString()}
                      </span>
                      {i > 0 && (
                        <span className="text-xs text-destructive/80">
                          -{dropPct.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-7 w-full rounded bg-muted/40">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${Math.max(widthPct, 2)}%`,
                        background: i < 3 ? "var(--color-primary)" : "var(--color-success)",
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Trend + Portfolio */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard title="Decision Trend" description="Last 30 days">
          {trendData.length > 0 ? (
            <DecisionTrendChart data={trendData} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{loading ? "Loading trend data..." : "No decisions to show"}</p>
          )}
        </SectionCard>
        <SectionCard title="Portfolio Quality" description="Disbursed loans by days overdue today">
          {portfolio ? (
            <PortfolioQuality metrics={portfolio} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading metrics...</p>
          )}
        </SectionCard>
      </div>

      {/* Recent activity */}
      <SectionCard title="Recent Activity" description="Live feed" className="mt-4">
        {data && data.activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <ActivityFeed items={activityItems} maxItems={7} />
        )}
      </SectionCard>
    </AppShell>
  );
}
