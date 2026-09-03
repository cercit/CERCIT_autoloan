import { Pill } from "@/components/status";
import { quickEligibility } from "@/lib/engine";
import { inr } from "@/lib/format";

const toneMap = {
  LIKELY_APPROVE: "success",
  MAYBE: "warning",
  LIKELY_REJECT: "destructive",
  INSUFFICIENT_DATA: "muted",
} as const;

const labelMap = {
  LIKELY_APPROVE: "Likely eligible",
  MAYBE: "Borderline",
  LIKELY_REJECT: "Likely ineligible",
  INSUFFICIENT_DATA: "Awaiting data",
} as const;

export function EligibilityIndicator({
  cibilScore,
  monthlyIncome,
  loanAmount,
  tenure,
  existingEmi,
}: {
  cibilScore: number | null;
  monthlyIncome: number | null;
  loanAmount: number | null;
  tenure: number | null;
  existingEmi: number | null;
}) {
  const result = quickEligibility(cibilScore, monthlyIncome, loanAmount, tenure, existingEmi);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick eligibility
        </span>
        <Pill tone={toneMap[result.signal]}>{labelMap[result.signal]}</Pill>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {result.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {result.foir != null && result.emi != null && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] text-muted-foreground">Est. FOIR</p>
            <p className="font-semibold tabular">{result.foir}%</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Est. EMI</p>
            <p className="font-semibold tabular">{inr(result.emi)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
