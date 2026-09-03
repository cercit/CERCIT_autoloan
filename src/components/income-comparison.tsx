import { Pill } from "@/components/status";
import { validateIncomeAcrossDocuments, type ExtractedIncome } from "@/lib/engine";
import { inr } from "@/lib/format";

export function IncomeComparison({ incomes }: { incomes: ExtractedIncome[] }) {
  const result = validateIncomeAcrossDocuments(incomes);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-surface-subtle text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Monthly gross</th>
              <th className="px-3 py-2 text-right font-medium">Annual gross</th>
              <th className="px-3 py-2 text-right font-medium">Monthly net</th>
            </tr>
          </thead>
          <tbody>
            {result.sources.map((s) => (
              <tr key={s.source} className="border-t border-border">
                <td className="px-3 py-2 capitalize">{s.source.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-right tabular">{inr(s.monthlyGross)}</td>
                <td className="px-3 py-2 text-right tabular">{inr(s.annualGross)}</td>
                <td className="px-3 py-2 text-right tabular">{inr(s.monthlyNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        {result.passed ? (
          <Pill tone="success">Income consistent</Pill>
        ) : (
          <Pill tone="destructive">Variance detected</Pill>
        )}
        <span className="text-xs text-muted-foreground">
          Max variance: {result.maxVariance}% (threshold: {result.threshold}%)
        </span>
      </div>
      {result.flags.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {result.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
