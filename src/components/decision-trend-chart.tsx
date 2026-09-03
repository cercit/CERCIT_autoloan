import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DecisionTrendPoint } from "@/lib/api";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function DecisionTrendChart({ data }: { data: DecisionTrendPoint[] }) {
  const formatted = data.map((p) => ({ ...p, label: formatDate(p.date) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={formatted}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="approved"
          stroke="#22c55e"
          name="Approved"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="rejected"
          stroke="#ef4444"
          name="Rejected"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="review"
          stroke="#eab308"
          name="Review"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
