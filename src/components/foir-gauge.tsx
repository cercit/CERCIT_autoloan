import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface FOIRGaugeProps {
  foirPercent: number;
  grossIncome: number;
  existingEmiTotal: number;
  proposedEmi: number;
  otherObligations: number;
  maxEligibleEmi: number;
  className?: string;
}

export function FOIRGauge({
  foirPercent,
  grossIncome,
  existingEmiTotal,
  proposedEmi,
  otherObligations,
  maxEligibleEmi,
  className,
}: FOIRGaugeProps) {
  const verdict =
    foirPercent <= 40 ? "Pass" : foirPercent <= 50 ? "Marginal" : foirPercent <= 60 ? "Caution" : "Fail";

  const colorClass =
    foirPercent <= 40 ? "text-green-600" :
    foirPercent <= 50 ? "text-yellow-600" :
    foirPercent <= 60 ? "text-orange-600" : "text-red-600";

  const barColor =
    foirPercent <= 40 ? "bg-green-500" :
    foirPercent <= 50 ? "bg-yellow-500" :
    foirPercent <= 60 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className={cn("panel", className)}>
      <h3 className="text-sm font-semibold tracking-tight mb-4">FOIR Gauge</h3>

      <div className="relative h-40 mb-4">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Semicircle background track */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* Colored arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(foirPercent / 60) * 502} 502`}
            className={barColor.replace("bg-", "text-")}
          />
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2={100 + 70 * Math.sin((foirPercent / 60) * Math.PI)}
            y2={100 - 70 * Math.cos((foirPercent / 60) * Math.PI)}
            stroke="#1f2937"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
          <span className={cn("text-3xl font-bold", colorClass)}>{foirPercent.toFixed(1)}%</span>
          <p className="text-xs text-muted-foreground">{verdict}</p>
        </div>
      </div>

      <div className="flex gap-1 h-2.5 rounded-full overflow-hidden mb-3">
        <div className="bg-green-500" style={{ width: `${Math.min(100, (grossIncome * 0.4) / grossIncome * 100)}%` }} />
        <div className="bg-blue-500" style={{ width: `${Math.min(100, (existingEmiTotal / grossIncome) * 100)}%` }} />
        <div className="bg-purple-500" style={{ width: `${Math.min(100, (proposedEmi / grossIncome) * 100)}%` }} />
        <div className="bg-gray-400 flex-1" />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
        <div><span className="text-green-600">●</span> Surplus: {inr(grossIncome - existingEmiTotal - proposedEmi - otherObligations)}</div>
        <div><span className="text-blue-500">●</span> Existing EMI: {inr(existingEmiTotal)}</div>
        <div><span className="text-purple-500">●</span> Proposed EMI: {inr(proposedEmi)}</div>
        <div><span className="text-gray-400">●</span> Other: {inr(otherObligations)}</div>
      </div>

      <p className="text-sm font-medium">Max eligible EMI: <span className="text-primary font-bold">{inr(maxEligibleEmi)}</span></p>
    </div>
  );
}
