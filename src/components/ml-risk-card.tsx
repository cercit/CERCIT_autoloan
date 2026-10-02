import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskScoreExplainer } from "@/components/risk-score-explainer";
import { buildRiskFeatures, buildPolicyInput } from "@/lib/ml-features";
import { computeRiskScore, type RiskScoreResult } from "@/lib/risk-score-model";
import { CHALLENGER_VERSION } from "@/lib/onnx-inference";
import { evaluatePolicy, POLICY_RULES } from "@/lib/policy-rule-engine";
import type { Application, BureauReport, BankStatementSummary } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const WEEK3_RULES = new Set([
  "GOVT_EMPLOYEE_CHECK", "FREE_INCOME_FLOOR", "CC_SERVICING",
  "BUREAU_RECALIBRATED", "TENURE_CAP", "LTV_100_SALARIED",
]);

export function MlRiskCard({
  app, bureau, banking,
}: {
  app: Application;
  bureau?: BureauReport | null;
  banking?: BankStatementSummary | null;
}) {
  const features = useMemo(() => buildRiskFeatures(app, bureau, banking), [app, bureau, banking]);
  const policy = useMemo(() => evaluatePolicy(buildPolicyInput(app, features)), [app, features]);
  const [result, setResult] = useState<RiskScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenger, setChallenger] = useState<RiskScoreResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    setChallenger(null);
    computeRiskScore(features)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "scoring failed"); })
      // after the approved score, so the two never compete for the model runner
      .then(() => (CHALLENGER_VERSION ? computeRiskScore(features, CHALLENGER_VERSION) : null))
      .then((r) => { if (!cancelled && r) setChallenger(r); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [features]);

  const failed = new Set([...policy.hardFailures, ...policy.softFailures]);
  const week3 = POLICY_RULES.filter((r) => WEEK3_RULES.has(r.id));

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600">ML scoring unavailable: {error}</p>
      ) : result ? (
        <RiskScoreExplainer result={result} />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}

      {result && challenger && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Retrained model ({challenger.modelVersion}, not yet signed off): grade{" "}
          <span className="font-semibold text-foreground">{challenger.grade}</span>, chance of 30+ days late{" "}
          <span className="font-semibold text-foreground">{(challenger.defaultProbability * 100).toFixed(1)}%</span>
          {challenger.grade !== result.grade ? ` (approved model says ${result.grade})` : ", same grade as the approved model"}.
          Shown for comparison only; it does not change the decision.
        </p>
      )}

      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Policy checks (Week 3 rules)</h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold text-white",
              policy.bandColor === "green" ? "bg-emerald-500" : policy.bandColor === "amber" ? "bg-amber-500" : "bg-red-600"
            )}
          >
            {policy.decision.toUpperCase()} · {policy.rulesPassed}/{POLICY_RULES.length} passed
          </span>
        </div>
        <ul className="space-y-1.5">
          {week3.map((rule) => {
            const isFail = failed.has(rule.name);
            return (
              <li key={rule.id} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    "mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full",
                    isFail ? (rule.severity === "hard" ? "bg-red-600" : "bg-amber-500") : "bg-emerald-500"
                  )}
                />
                <span className="font-medium w-44 flex-shrink-0">{rule.name}</span>
                <span className="text-muted-foreground">{rule.description}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">{policy.reason}</p>
      </div>
    </div>
  );
}
