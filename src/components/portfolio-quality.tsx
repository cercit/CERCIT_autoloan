import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { LabelValue } from "@/components/app-shell";
import type { PortfolioMetrics } from "@/lib/api";

export function PortfolioQuality({ metrics }: { metrics: PortfolioMetrics }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <LabelValue label="Avg CIBIL score" value={String(metrics.avgCibilScore)} />
        <LabelValue label="Avg FOIR" value={`${metrics.avgFoir}%`} />
        <LabelValue label="Avg LTV" value={`${metrics.avgLtv}%`} />
        <LabelValue label="NPA prediction" value={`${metrics.npaPredictionRate}%`} />
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={metrics.riskDistribution}
              dataKey="value"
              nameKey="name"
              innerRadius="50%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="none"
            >
              {metrics.riskDistribution.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
