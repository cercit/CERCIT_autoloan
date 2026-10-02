import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { LabelValue } from "@/components/app-shell";
import type { PortfolioMetrics } from "@/lib/api";

const inr = (n: number) =>
  n >= 1e7
    ? `₹${(n / 1e7).toFixed(2)} Cr`
    : n >= 1e5
      ? `₹${(n / 1e5).toFixed(1)} L`
      : `₹${Math.round(n).toLocaleString("en-IN")}`;

export function PortfolioQuality({ metrics }: { metrics: PortfolioMetrics }) {
  if (!metrics.available) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{metrics.message}</p>;
  }
  if (metrics.loans === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No loans have been disbursed yet.
      </p>
    );
  }
  const shown = metrics.buckets.filter((b) => b.value > 0);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <LabelValue label="Loans on book" value={metrics.loans.toLocaleString("en-IN")} />
          <LabelValue label="Principal owed" value={inr(metrics.principalLeft)} />
          <LabelValue label="Overdue today" value={`${metrics.loansOverdue} loans`} />
          <LabelValue
            label="PAR 30"
            value={metrics.par30Pct == null ? "–" : `${metrics.par30Pct}%`}
          />
        </div>
        <Link to="/portfolio" className="text-sm text-primary hover:underline">
          Open the loan portfolio
        </Link>
      </div>
      <div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={shown}
                dataKey="value"
                nameKey="name"
                isAnimationActive={false}
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="none"
              >
                {shown.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, n: string) => [
                  `${v} loans`,
                  n === "Current" ? "Current" : `${n} days overdue`,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {metrics.buckets.map((b) => (
            <li key={b.name} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: b.color }} />
              {b.name === "Current" ? "Current" : `${b.name} days`} · {b.value}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
