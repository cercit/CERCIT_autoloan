import { cn } from "@/lib/utils";
import type { RiskScoreResult } from "@/lib/risk-score-model";

export interface RiskScoreExplainerProps {
  result: RiskScoreResult;
  className?: string;
}

const GRADE_COLORS = {
  A: { bg: "bg-emerald-500", label: "Very low risk", range: "< 1%" },
  B: { bg: "bg-green-500", label: "Low risk", range: "1 - 2.5%" },
  C: { bg: "bg-yellow-400", label: "Moderate", range: "2.5 - 6%" },
  D: { bg: "bg-orange-500", label: "Elevated", range: "6 - 15%" },
  E: { bg: "bg-red-600", label: "High risk", range: "> 15%" },
};

const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} pp`;

export function RiskScoreExplainer({ result, className }: RiskScoreExplainerProps) {
  const gradeInfo = GRADE_COLORS[result.grade];
  const items = result.featureContributions.slice(0, 8);
  const maxAbs = Math.max(0.001, ...items.map((c) => Math.abs(c.contribution)));

  // waterfall: base rate -> each contribution -> final probability
  let running = result.baseProbability;
  const steps = items.map((c) => {
    const start = running;
    running += c.contribution;
    return { ...c, start, end: running };
  });
  const residual = result.defaultProbability - running;
  const axisMax = Math.max(
    result.defaultProbability,
    result.baseProbability,
    ...steps.map((s) => Math.max(s.start, s.end))
  ) * 1.15;

  return (
    <div className={cn("panel", className)}>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">ML risk score: {result.score} / 1000</h3>
          <p className="text-sm text-muted-foreground">
            Grade {result.grade} ({gradeInfo.label}) · P(30+ DPD in 12 months) {(result.defaultProbability * 100).toFixed(2)}%
          </p>
        </div>
        <span className={cn("text-4xl font-extrabold px-4 py-1.5 rounded-xl text-white", gradeInfo.bg)}>
          {result.grade}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-4">
        <span className="rounded border px-1.5 py-0.5 font-mono">{result.modelVersion}</span>
        <span>{result.source === "xgboost-onnx" ? "XGBoost via ONNX Runtime (browser)" : "Legacy formula (model unavailable)"}</span>
        <span>· grade {result.grade} band: {gradeInfo.range}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <h4 className="font-bold uppercase tracking-wide text-muted-foreground">Why this score</h4>
          <span className="text-muted-foreground">Portfolio average {(result.baseProbability * 100).toFixed(1)}%</span>
        </div>

        <WaterfallRow label="Portfolio average" start={0} end={result.baseProbability} axisMax={axisMax} tone="neutral" value={`${(result.baseProbability * 100).toFixed(1)}%`} />
        {steps.map((s) => (
          <WaterfallRow
            key={s.feature}
            label={`${s.humanName} = ${formatValue(s.feature, s.value)}`}
            start={Math.min(s.start, s.end)}
            end={Math.max(s.start, s.end)}
            axisMax={axisMax}
            tone={s.contribution > 0 ? "up" : "down"}
            value={pp(s.contribution)}
          />
        ))}
        {Math.abs(residual) > 0.0005 && (
          <WaterfallRow label="Other factors / interactions" start={Math.min(running, result.defaultProbability)} end={Math.max(running, result.defaultProbability)} axisMax={axisMax} tone={residual > 0 ? "up" : "down"} value={pp(residual)} muted />
        )}
        <WaterfallRow label="This applicant" start={0} end={result.defaultProbability} axisMax={axisMax} tone="final" value={`${(result.defaultProbability * 100).toFixed(2)}%`} />
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Each bar shows how P(bad) moves when that one factor is swapped for the portfolio average. Positive = adds risk.
        Scale is capped at {(axisMax * 100).toFixed(0)}% so small effects stay visible; max single effect here is {pp(maxAbs).replace("+", "")}.
      </p>
    </div>
  );
}

function WaterfallRow({
  label, start, end, axisMax, tone, value, muted,
}: {
  label: string; start: number; end: number; axisMax: number;
  tone: "neutral" | "up" | "down" | "final"; value: string; muted?: boolean;
}) {
  const left = (start / axisMax) * 100;
  const width = Math.max(0.6, ((end - start) / axisMax) * 100);
  const color =
    tone === "up" ? "bg-red-500" : tone === "down" ? "bg-green-500" : tone === "final" ? "bg-foreground" : "bg-slate-400";
  const text =
    tone === "up" ? "text-red-600" : tone === "down" ? "text-green-600" : "text-foreground";
  return (
    <div className={cn("flex items-center gap-2 text-xs", muted && "opacity-70")}>
      <span className="w-40 flex-shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted relative overflow-hidden">
        <div className={cn("absolute top-0 h-full rounded-full", color)} style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <span className={cn("w-16 text-right tabular-nums font-medium", text)}>{value}</span>
    </div>
  );
}

function formatValue(feature: string, v: number): string {
  switch (feature) {
    case "govtEmployee": return v ? "yes" : "no";
    case "dpdWriteOff": return v ? "yes" : "no";
    case "ccServicingPattern": return ["no card", "pays full", "partial", "min due"][v] ?? String(v);
    case "ltvPercent": case "foirPercent": case "freeIncomeRatio": case "cashWithdrawalRatio": return `${Math.round(v)}%`;
    case "tenureMonths": return `${v} mo`;
    case "employmentYears": return `${v} yr`;
    case "salaryRegularity": return `${v}/6`;
    default: return String(Math.round(v * 10) / 10);
  }
}
