import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DecisionOverrideFormProps {
  currentDecision: "approve" | "review" | "decline";
  policyScore: number;
  failedRules: string[];
  onSubmit?: (result: { decision: string; category: string; reason: string; conditions: string[] }) => void;
  className?: string;
}

const CATEGORIES = ["Credit exception", "Policy relaxation", "Additional collateral", "Guarantor added", "Management approval", "Other"];

export function DecisionOverrideForm({ currentDecision, policyScore, failedRules, onSubmit, className }: DecisionOverrideFormProps) {
  const [newDecision, setNewDecision] = useState<"approve" | "review" | "decline">(currentDecision);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const allConditionsChecked = ["extra_income_proof", "higher_margin", "guarantor", "reduced_amount", "shorter_tenure"].every((c) => conditions[c] || newDecision !== "approve");
  const overridingToApprove = newDecision === "approve" && currentDecision === "decline";

  const handleSubmit = () => {
    if (!reason.trim() || reason.length < 50) return;
    onSubmit?.({ decision: newDecision, category, reason: reason.trim(), conditions: Object.keys(conditions).filter((k) => conditions[k]) });
    setSubmitted(true);
  };

  return (
    <div className={cn("panel", className)}>
      <h3 className="text-sm font-semibold tracking-tight mb-3">Override Decision</h3>
      <div className="rounded-md bg-muted/30 p-3 mb-4 text-sm">
        <p className="text-xs text-muted-foreground mb-1">Current decision</p>
        <p className="font-bold">{currentDecision.toUpperCase()} (Score: {policyScore}/100)</p>
        {failedRules.length > 0 && <p className="text-xs text-red-600 mt-1">Failed: {failedRules.join(", ")}</p>}
      </div>

      {overridingToApprove && (
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <strong>Warning:</strong> You are overriding a declined application to approve. This requires documented justification and additional conditions.
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">New decision</label>
          <div className="flex gap-2 mt-1">
            {(["approve", "review", "decline"] as const).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="radio" name="newDecision" value={d} checked={newDecision === d} onChange={() => setNewDecision(d)} disabled={d === currentDecision} className="text-primary" />
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="category" className="text-xs font-medium text-muted-foreground block">Override category</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full mt-1 rounded-md border px-3 py-2 text-sm bg-background">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="reason" className="text-xs font-medium text-muted-foreground block">Reason ({reason.length}/50 min)</label>
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full mt-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Provide detailed justification..." />
          <p className={cn("text-xs mt-0.5", reason.length < 50 ? "text-red-600" : "text-green-600")}>{reason.length}/50 characters required</p>
        </div>
      </div>

      {newDecision === "approve" && currentDecision === "decline" && (
        <div className="mt-3 pt-3 border-t space-y-1.5">
          <h4 className="text-xs font-bold">Required conditions</h4>
          {(["extra_income_proof", "higher_margin", "guarantor", "reduced_amount", "shorter_tenure"] as const).map((cond) => (
            <label key={cond} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={!!conditions[cond]} onChange={(e) => setConditions({ ...conditions, [cond]: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300 text-primary" />
              <span>{cond.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => onSubmit?.({ decision: currentDecision, category: "", reason: "", conditions: [] })} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={handleSubmit} disabled={reason.length < 50 || !reason.trim() || (newDecision === "approve" && currentDecision === "decline" && !allConditionsChecked)} className={cn("rounded-md px-4 py-2 text-sm font-medium text-white transition-colors", reason.length >= 50 ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}>
          Submit override
        </button>
      </div>
    </div>
  );
}
