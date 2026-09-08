import { cn } from "@/lib/utils";
import { pct } from "@/lib/format";
import type { RiskScoreResult, FeatureContribution } from "@/lib/risk-score-model";

export interface RiskScoreExplainerProps {
  result: RiskScoreResult;
  className?: string;
}

const GRADE_COLORS = {
  A: { bg: "bg-emerald-500", text: "text-emerald-700", label: "Excellent" },
  B: { bg: "bg-green-500", text: "text-green-700", label: "Good" },
  C: { bg: "bg-yellow-400", text: "text-yellow-700", label: "Average" },
  D: { bg: "bg-orange-500", text: "text-orange-700", label: "Below Average" },
  E: { bg: "bg-red-600", text: "text-red-700", label: "High Risk" },
};

export function RiskScoreExplainer({ result, className }: RiskScoreExplainerProps) {
  const gradeInfo = GRADE_COLORS[result.grade];
  const topContributions = result.featureContributions.slice(0, 8);

  return (
    <div className={cn("panel", className)}>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold">Risk Score: {result.score} / 1000</h3>
          <p className="text-sm text-muted-foreground">Grade {result.grade} — {gradeInfo.label}</p>
        </div>
        <span className={cn("text-4xl font-extrabold px-4 py-1.5 rounded-xl text-white", gradeInfo.bg)}>
          {result.grade}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-0.5">Score Range (0 — 1000)</p>
        <div className="h-3 w-full rounded-full bg-gradient-to-r from-red-600 via-orange-400 via-yellow-300 via-green-400 to-emerald-500 relative overflow-hidden">
          <div
            className="absolute top-0 h-full w-1 bg-foreground rounded-full shadow-md"
            style={{ left: `${(result.score / 1000) * 100}%`, transform: "translateX(-50%)" }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>100</span>
          <span>300</span>
          <span>500</span>
          <span>700</span>
          <span>900</span>
        </div>
      </div>

      <p className="text-sm mb-1">Default probability: <span className="font-bold">{pct(result.defaultProbability)}%</span></p>

      <div className="mt-4 space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Top contributing factors</h4>
        {topContributions.map((c) => {
          const width = Math.abs(c.contribution) * 2; // scaled for display
          const maxW = Math.max(...topContributions.map((x) => Math.abs(x.contribution) * 2));
          const pctW = maxW > 0 ? (Math.abs(c.contribution) / Math.max(...topContributions.map(x => Math.abs(x.contribution)))) * 100 : 0;
          return (
            <div key={c.feature} className="flex items-center gap-2 text-xs">
              <span className="w-28 flex-shrink-0 truncate" title={c.humanName}>{c.humanName}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted relative overflow-hidden">
                <div
                  className={cn("h-full rounded-full", c.direction === "increases_risk" ? "bg-red-500" : "bg-green-500")}
                  style={{ width: `${pctW}%` }}
                />
              </div>
              <span className={cn("w-14 text-right tabular-nums font-medium", c.direction === "increases_risk" ? "text-red-600" : "text-green-600")}>
                {c.contribution > 0 ? "+" : ""}{c.contribution.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
