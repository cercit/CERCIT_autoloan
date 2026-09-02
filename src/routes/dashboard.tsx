import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge, ScoreText, StatusPill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApplications, getDashboardStats } from "@/lib/api";
import type { Application } from "@/lib/mock-data";
import { tatData } from "@/lib/mock-data";
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

const donutColors = ["var(--color-success)", "var(--color-warning)", "var(--color-destructive)"];

function Dashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getApplications().then(setApplications),
      getDashboardStats().then(setStats),
    ]).finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: "Total Applications", value: stats.total },
    { label: "Pending Review", value: stats.pending },
    { label: "Approved", value: stats.approved },
    { label: "Rejected", value: stats.rejected },
  ];

  const total = stats.approved + stats.pending + stats.rejected;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Wednesday workload — Chennai, Anna Nagar branch"
      actions={
        <Button asChild>
          <Link to="/applications/new">
            <Plus className="size-4" /> New application
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="panel p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))
        ) : (
        statCards.map((stat) => (
          <div key={stat.label} className="panel p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <div className="mt-2">
              <span className="text-3xl font-semibold tabular">{stat.value}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">this month</p>
          </div>
        )))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <SectionCard
          title="Application Queue"
          description="Next files to process"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/applications">View all</Link>
            </Button>
          }
          className="overflow-hidden"
        >
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="sticky top-0 bg-surface-subtle text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Application</th>
                  <th className="px-4 py-2 text-left font-medium">Applicant</th>
                  <th className="px-4 py-2 text-left font-medium">Employer</th>
                  <th className="px-4 py-2 text-right font-medium">Loan</th>
                  <th className="px-4 py-2 text-right font-medium">CIBIL</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Submitted</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {applications.map((app, i) => (
                  <tr
                    key={app.id}
                    className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to="/applications/$id"
                        params={{ id: app.id }}
                        className="font-medium whitespace-nowrap text-primary hover:underline"
                      >
                        {app.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{app.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <CategoryBadge category={app.category} />
                        {app.employer}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {inr(app.loanAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ScoreText score={app.cibil} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={app.status} />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {app.submitted}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/applications/$id" params={{ id: app.id }}>
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Decision Distribution" description="This month">
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Auto-Approved", key: "approved", value: stats.approved },
                    { name: "Manual Review", key: "pending", value: stats.pending },
                    { name: "Rejected", key: "rejected", value: stats.rejected },
                  ]}
                  dataKey="value"
                  innerRadius="62%"
                  outerRadius="90%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {[
                    { key: "approved", value: stats.approved },
                    { key: "pending", value: stats.pending },
                    { key: "rejected", value: stats.rejected },
                  ].map((entry, i) => (
                    <Cell key={entry.key} fill={donutColors[i]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.235 0.026 264)",
                    border: "1px solid oklch(0.35 0.02 264)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  itemStyle={{ color: "oklch(0.965 0.006 248)" }}
                  labelStyle={{ color: "oklch(0.965 0.006 248)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular">{total}</span>
              <span className="text-xs text-muted-foreground">applications</span>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {[
              { name: "Auto-Approved", key: "approved", value: stats.approved },
              { name: "Manual Review", key: "pending", value: stats.pending },
              { name: "Rejected", key: "rejected", value: stats.rejected },
            ].map((d, i) => (
              <li key={d.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: donutColors[i] }}
                  />
                  {d.name}
                </span>
                <span className="tabular text-muted-foreground">
                  {d.value} · {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Average Turnaround Time"
        description="Last 4 weeks — target 60 minutes for clean files"
        className="mt-4"
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tatDataFetched.length > 0 ? tatDataFetched : tatData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                unit="m"
              />
              <Tooltip
                cursor={{ fill: "var(--color-muted)" }}
                contentStyle={{
                  background: "oklch(0.235 0.026 264)",
                  border: "1px solid oklch(0.35 0.02 264)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                itemStyle={{ color: "oklch(0.965 0.006 248)" }}
                labelStyle={{ color: "oklch(0.965 0.006 248)" }}
              />
              <ReferenceLine
                y={60}
                stroke="var(--color-destructive)"
                strokeDasharray="4 4"
                label={{
                  value: "Target 60m",
                  position: "insideTopRight",
                  fill: "var(--color-muted-foreground)",
                  fontSize: 11,
                }}
              />
              <Bar
                dataKey="minutes"
                fill="var(--color-primary)"
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </AppShell>
  );
}
