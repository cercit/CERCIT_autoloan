import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";

import { submitOfficerDecision } from "@/lib/api";
import type { OfficerDecisionResult } from "@/lib/api";
import type { Application } from "@/lib/mock-data";
import { inr } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/app-shell";

export function ManagerDecisionPanel({ app }: { app: Application }) {
  const navigate = useNavigate();
  const [decision, setDecision] = useState<string>("Approve");
  const [amount, setAmount] = useState(String(app.loanAmount));
  const [rate, setRate] = useState(String(app.rate));
  const [tenure, setTenure] = useState(String(app.tenure));
  const [remarks, setRemarks] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const hasReferral = !!(app.referredBy && app.referralNote);
  const overrideNeeded = decision !== app.recommendation;

  async function handleSubmit() {
    if (overrideNeeded && !overrideReason.trim()) {
      setFeedback({ type: "error", message: "Override reason is required when decision differs from AI recommendation." });
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    const res = await submitOfficerDecision({
      applicationId: app.id,
      decision: decision.toUpperCase() as "APPROVE" | "REJECT" | "MAYBE",
      remarks: remarks || undefined,
      sanctionedAmount: Number(amount) || undefined,
      sanctionedRate: Number(rate) || undefined,
      sanctionedTenure: Number(tenure) || undefined,
      overrideReason: overrideReason || undefined,
    } as import("@/lib/api").OfficerDecisionInput);

    setSubmitting(false);
    if (res) {
      setFeedback({ type: "success", message: res.message || "Decision submitted successfully." });
      // Navigate back to application detail on success after a brief delay
      setTimeout(() => {
        navigate({ to: "/applications/$id", params: { id: app.id } });
      }, 1200);
    } else {
      setFeedback({ type: "error", message: "Submission failed. Please try again." });
    }
  }

  return (
    <div className="space-y-4">
      {/* Referral details */}
      <SectionCard title="Referral Details" description={hasReferral ? "Referred file — manager review required" : "Direct review"}>
        {hasReferral ? (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Referred by</Label>
                <p className="text-sm font-medium">{app.referredBy}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <p className="text-sm font-medium">Referred</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Recommendation</Label>
                <p className="text-sm font-medium">{app.recommendation}</p>
              </div>
            </div>
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Referral note</p>
              <p className="text-sm">{app.referralNote}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Direct review (no referral) — this file has not been referred by a credit officer.</p>
        )}
      </SectionCard>

      {/* Officer recommendation */}
      <SectionCard title="Officer Recommendation" description="AI-generated recommendation and key points">
        <div className="rounded-md border p-4" style={{ borderColor: app.recommendation === "Approve" ? "#16a34a40" : app.recommendation === "Maybe" ? "#eab30840" : "#dc262640", backgroundColor: app.recommendation === "Approve" ? "#16a34a0d" : app.recommendation === "Maybe" ? "#eab3080d" : "#dc26260d" }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI Recommendation</span>
          </div>
          <p className="text-base font-semibold">
            {app.recommendation === "Approve" && `Approve — ${inr(app.loanAmount)} at ${app.rate}% for ${app.tenure} months`}
            {app.recommendation === "Maybe" && "Maybe — manual review recommended"}
            {app.recommendation === "Reject" && "Reject — policy breach"}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {app.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {app.flags.length > 0 && (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <AlertTriangle className="size-4" /> Flags
              </p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {app.flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Manager decision form */}
      <SectionCard title="Manager Decision" description="Select decision, set sanctioned terms, and submit">
        <div className="space-y-4">
          {/* Decision radios */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Decision</Label>
            <div className="flex gap-3">
              {[
                { value: "Approve", label: "Approve", tone: "success" },
                { value: "Reject", label: "Reject", tone: "destructive" },
                { value: "Refer back", label: "Refer back to officer", tone: "warning" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="manager-decision"
                    value={opt.value}
                    checked={decision === opt.value}
                    onChange={(e) => setDecision(e.target.value)}
                    className="h-4 w-4 text-primary border-border focus:ring-primary"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Override reason (required if decision != recommendation) */}
          {overrideNeeded && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-1.5">
              <Label className="text-xs font-semibold">
                Override reason (required — decision differs from AI recommendation: {app.recommendation})
              </Label>
              <Textarea
                rows={2}
                placeholder="Explain why the manager decision deviates from the AI recommendation..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="bg-background"
              />
            </div>
          )}

          {decision === "Refer back" && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-1.5">
              <Label className="text-xs font-semibold">Notes for credit officer (required for refer back)</Label>
              <Textarea
                rows={2}
                placeholder="Provide context and instructions for the referring officer..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="bg-background"
              />
            </div>
          )}

          {/* Remarks */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Remarks (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Additional manager remarks, conditions, or notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Sanctioned terms */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sanctioned-amount" className="text-xs text-muted-foreground">Sanctioned amount (Rs)</Label>
              <Input
                id="sanctioned-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(app.loanAmount)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sanctioned-rate" className="text-xs text-muted-foreground">Sanctioned rate (%)</Label>
              <Input
                id="sanctioned-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={String(app.rate)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sanctioned-tenure" className="text-xs text-muted-foreground">Sanctioned tenure (months)</Label>
              <Input
                id="sanctioned-tenure"
                value={tenure}
                onChange={(e) => setTenure(e.target.value)}
                placeholder={String(app.tenure)}
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            disabled={submitting || (overrideNeeded && !overrideReason.trim())}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" /> Submitting...
              </>
            ) : (
              "Submit decision"
            )}
          </Button>

          {/* Feedback */}
          {feedback && (
            <div
              className={`rounded-md border px-4 py-3 text-sm flex items-start gap-2 ${
                feedback.type === "success"
                  ? "border-success/40 bg-success/10 text-success-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive-foreground"
              }`}
            >
              {feedback.type === "success" ? (
                <Check className="size-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
