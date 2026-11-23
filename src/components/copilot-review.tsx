import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LabelValue, SectionCard } from "@/components/app-shell";
import { CategoryBadge, MeterBar, Pill, StatusPill } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitOfficerDecision } from "@/lib/api";
import { getCurrentUser, isDemoMode } from "@/lib/auth";
import { can, useMyRights } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import type { OfficerDecisionResult } from "@/lib/api";
import { emiFor, inr } from "@/lib/format";
import {
  activityLog,
  bureauMetrics,
  documents,
  dpdHistory,
  incomeSources,
  overrideHistory,
  policyChecks,
  type Application,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { calculateIncome, calculateLTV } from "@/lib/engine";
import { runAssessment, detectFraudFlags, checkEmployerConsistency, type FraudFlag } from "@/lib/engine";
import { IncomeComparison } from "@/components/income-comparison";

const recTone = {
  Approve: "success",
  Maybe: "warning",
  Reject: "destructive",
} as const;

function Collapsible({
  title,
  children,
  defaultOpen = false,
  right,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </section>
  );
}

export function CopilotReview({ app, manager = false }: { app: Application; manager?: boolean }) {
  const navigate = useNavigate();
  // C2: the income sources, bureau metrics, document list, cross-checks, override history
  // and activity below are sample records. They show in sample mode only; on the live site
  // the real figures are on the Banking, Bureau, Documents and Timeline tabs.
  const sample = !isSupabaseConfigured || isDemoMode();
  // B3: only a role with app.decide can record a decision
  const rights = useMyRights();
  const canDecide = can(rights, "app.decide");
  // 097: only the Head may change a case that is already approved or rejected (the database checks too)
  const isHead = !!rights && (rights.everything || rights.role === "credit_head" || rights.role === "practice_head");
  // B5: the person's own sanction limit (Users page), checked by the database on approval
  const [myLimit, setMyLimit] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (sample) return;
    void getCurrentUser().then((me) => setMyLimit(me?.maxSanctionAmount ?? null)).catch(() => setMyLimit(undefined));
  }, [sample]);
  const checks = app.ruleChecks ?? (sample ? policyChecks : []);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(app.loanAmount));
  // The engine's rate for this case (8.99% approve, 9.9% refer). It was missing from the list, so the box showed blank.
  const engineRate = String(app.rate || (app.recommendation === "Approve" ? 8.99 : 9.9));
  const rateOptions = Array.from(new Set(["8.75", "8.99", "9.25", "9.5", "9.75", "9.9", "10.25", "11.5", engineRate]))
    .sort((x, y) => Number(x) - Number(y));
  const [rate, setRate] = useState(engineRate);
  const [rateReason, setRateReason] = useState("");
  const [tenure, setTenure] = useState(String(app.tenure));
  const [remarks, setRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OfficerDecisionResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const rateChanged = rate !== engineRate;
  const aiDecision = app.recommendation === "Approve" ? "APPROVE" : app.recommendation === "Reject" ? "REJECT" : "MAYBE";

  // Checks before anything is sent, so the person sees what is missing next to the button.
  async function decide(finalDecision: "APPROVE" | "REJECT" | "MAYBE") {
    if (changing && changeReason.trim().length < 10) {
      toast.error("Say why the decision is being changed (at least 10 characters).");
      return;
    }
    if (finalDecision === "APPROVE" && rateChanged && !rateReason.trim()) {
      toast.error(`Say why the rate is ${rate}% and not the engine rate ${engineRate}%.`);
      return;
    }
    if (finalDecision === "REJECT" && !rejectReason) {
      toast.error("Pick a reason code to reject.");
      return;
    }
    if (finalDecision === "MAYBE" && !remarks.trim()) {
      toast.error(manager ? "Add a note for the credit officer." : "Add a note for the manager.");
      return;
    }
    if (finalDecision !== "MAYBE" && finalDecision !== aiDecision && !overrideReason.trim()) {
      toast.error(`The AI said ${app.recommendation}. Give an override reason.`);
      return;
    }
    setSubmitting(true);
    const payload: Parameters<typeof submitOfficerDecision>[0] = {
      applicationId: app.id,
      decision: finalDecision as "APPROVE" | "REJECT" | "MAYBE",
    };
    const notes = [
      changing ? `Decision changed from ${app.status}: ${changeReason.trim()}` : "",
      remarks.trim(),
      finalDecision === "APPROVE" && rateChanged ? `Rate ${rate}% instead of the engine rate ${engineRate}%: ${rateReason.trim()}` : "",
    ].filter(Boolean).join(" | ");
    if (notes) payload.remarks = notes;
    if (finalDecision === "REJECT" && rejectReason) payload.reasonCodes = [rejectReason];
    if (Number(amount)) payload.sanctionedAmount = Number(amount);
    if (Number(rate)) payload.sanctionedRate = Number(rate);
    if (Number(tenure)) payload.sanctionedTenure = Number(tenure);
    if (overrideReason.trim() && finalDecision !== aiDecision) payload.overrideReason = overrideReason.trim();
    try {
      const res = await submitOfficerDecision(payload);
      if (!res.decisionRecorded) {
        // 095: the credit checks had not run; they have now. Show the result before deciding.
        toast.info(res.message, { duration: 8000 });
        setTimeout(() => window.location.reload(), 2500);
        return;
      }
      if (finalDecision === "MAYBE") {
        // Referred: the case leaves this person's hands, so go back to the list.
        toast.success(manager ? "Returned to the credit officer" : "Sent to the manager for review");
        navigate({ to: "/applications" });
        return;
      }
      toast.success((changing ? "Decision changed: " : "Decision recorded: ") + res.decision);
      setChanging(false);
      setResult(res);
      setShowResult(true);
    } catch (e) {
      toast.error("The decision wasn't recorded: " + (e as Error).message, { duration: 8000 });
    } finally {
      setSubmitting(false);
    }
  }

  const emi = emiFor(Number(amount) || 0, Number(rate) || 0, Number(tenure) || 60);
  const existingEmis = app.obligations.reduce((s, o) => s + o.emi, 0);
  const totalObligations = existingEmis + emi;
  const foir = (totalObligations / app.netIncome) * 100;
  const computedIncome = Math.min(...incomeSources.map((s) => s.amount));
  const variance =
    ((Math.max(...incomeSources.map((s) => s.amount)) - computedIncome) / computedIncome) * 100;
  // Audit A1: a real case shows what the database engine decided. The browser engine
  // below (runAssessment and friends) is only for the sample cases in prototype mode.
  const headFoir = sample ? foir : app.foir;
  const failedChecks = (app.ruleChecks ?? []).filter((c) => !c.pass);
  // A case that already has a final decision shows it, not the decision buttons
  // Letters follow the recorded decision: sanction only after approval, nothing after a rejection.
  const isSanctioned = (a: typeof app) => a.status === "Sanctioned" || a.status === "Disbursed";
  const decided = app.status === "Sanctioned" || app.status === "Disbursed" || app.status === "Rejected";
  // After a decision on this page, the page reflects it straight away.
  const currentStatus = result ? (result.decision === "APPROVE" ? "Sanctioned" : result.decision === "REJECT" ? "Rejected" : app.status) : app.status;
  const approvedNow = currentStatus === "Sanctioned" || currentStatus === "Disbursed";
  // 097: a decided case opens again only when the Head chooses "Change decision"; never once disbursed
  const changeable = isHead && canDecide && (app.status === "Sanctioned" || app.status === "Rejected") && !result;
  const locked = (decided && !(changing && changeable)) || !!result || !canDecide;
  const incomeAssessment = calculateIncome(app);
  const ltvAssessment = calculateLTV(app);
  const assessment = useMemo(() => runAssessment(app), [app]);
  const fraudCheck = useMemo(() => detectFraudFlags(app), [app]);
  const employerCheck = useMemo(
    () => checkEmployerConsistency(app.employer, app.employer, app.employer),
    [app.employer],
  );

  return (
    <div className="space-y-4">
      <div className="panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{app.name}</h2>
            <span className="text-sm tabular text-muted-foreground">{app.id}</span>
            <StatusPill status={app.status} />
            <Pill tone={recTone[app.recommendation]}>
              <Sparkles className="size-3" /> AI: {app.recommendation}
            </Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted {app.submitted} · Assigned to {app.assignedTo}
          </p>
          {manager && app.referredBy && (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <span className="font-medium">Referred by {app.referredBy}:</span> {app.referralNote}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sample
            ? manager && <Pill tone="primary">Delegation authority: up to Rs 25,00,000</Pill>
            : canDecide && myLimit !== undefined && (
                <Pill tone="primary">{myLimit === null ? "Your sanction limit: none set" : `Your sanction limit: ${inr(myLimit)}`}</Pill>
              )}
          {result ? (
            <Pill tone={result.decision === "APPROVE" ? "success" : result.decision === "REJECT" ? "destructive" : "warning"}>
              Decision recorded: {result.decision}
            </Pill>
          ) : decided ? (
            <Pill tone={app.status === "Rejected" ? "destructive" : "success"}>Decided: {app.status}</Pill>
          ) : null}
        </div>
      </div>

      {/* Key metrics strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CIBIL</p>
          <p className={cn(
            "mt-1 text-2xl font-bold tabular tracking-tight",
            !app.cibil ? "text-muted-foreground" : app.cibil >= 750 ? "text-success" : app.cibil >= 650 ? "text-warning" : "text-destructive",
          )}>{app.cibil || "—"}</p>
          <p className="text-[11px] text-muted-foreground">{!app.cibil ? "No bureau report yet" : app.cibil >= 750 ? "Above threshold" : app.cibil >= 650 ? "Marginal" : "Below threshold"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">FOIR</p>
          <p className={cn(
            "mt-1 text-2xl font-bold tabular tracking-tight",
            headFoir > 50 ? "text-destructive" : "text-success",
          )}>{headFoir.toFixed(1)}%</p>
          <p className="text-[11px] text-muted-foreground">{sample ? "Threshold: 50%" : "From the engine · limit 50%"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">LTV (ex-showroom)</p>
          <p className="mt-1 text-2xl font-bold tabular tracking-tight">{app.ltvExShowroom}%</p>
          <p className="text-[11px] text-muted-foreground">Max: 120%{app.ltvOnRoad ? ` · on-road ${app.ltvOnRoad}%` : ""}</p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Loan amount</p>
          <p className="mt-1 text-2xl font-bold tabular tracking-tight">{inr(app.loanAmount)}</p>
          <p className="text-[11px] text-muted-foreground">{app.vehicle}</p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net income</p>
          <p className="mt-1 text-2xl font-bold tabular tracking-tight">{inr(app.netIncome)}</p>
          <p className="text-[11px] text-muted-foreground">EMI: {inr(emi)}</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section
            className={cn(
              "panel overflow-hidden",
              app.recommendation === "Approve" && "border-success/40",
              app.recommendation === "Maybe" && "border-warning/40",
              app.recommendation === "Reject" && "border-destructive/40",
            )}
          >
            <div
              className={cn(
                "px-4 py-3",
                app.recommendation === "Approve" && "bg-success/12",
                app.recommendation === "Maybe" && "bg-warning/15",
                app.recommendation === "Reject" && "bg-destructive/12",
              )}
            >
              <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                AI Recommendation
              </p>
              <p className="mt-1 text-base font-semibold sm:text-lg">
                {sample
                  ? <>{assessment.decision.decision} — {assessment.decision.reasons[0] ?? `${inr(app.loanAmount)} at ${assessment.decision.suggestedRate}% for ${app.tenure} months`}</>
                  : <>{app.recommendation} — {failedChecks[0]?.rule ?? app.flags[0] ?? `${inr(app.loanAmount)} at ${app.rate}% for ${app.tenure} months`}</>}
              </p>
            </div>
            <div className="p-4">
              <ul className="space-y-1.5 text-sm">
                {app.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {reason}
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
          </section>

          <SectionCard title="Decision provenance">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabelValue label="Policy version" value={app.policyVersionId || "Not recorded"} />
              <LabelValue label="Rules fingerprint" value={app.rulesSnapshot ? app.rulesSnapshot.slice(0, 12) : "Not recorded"} />
              <LabelValue label="Model version" value={app.modelVersion || "Not recorded"} />
              <LabelValue label="Basis" value={
                <span className={cn(app.versionBasis === "ASSUMED" ? "text-warning" : "")}>{app.versionBasis || "Not recorded"}{app.versionBasis === "ASSUMED" ? " (backfilled)" : ""}</span>
              } />
            </div>
          </SectionCard>

          {!sample ? (
          <Collapsible title="Assessment Breakdown" defaultOpen>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelValue label="Recommendation" value={app.recommendation} />
              <LabelValue label="Rate" value={app.rate ? `${app.rate}%` : "Not priced"} />
              <LabelValue label="FOIR (engine)" value={`${app.foir}%`} />
              <LabelValue label="LTV ex-showroom" value={`${app.ltvExShowroom}%`} />
              <LabelValue label="LTV on-road" value={app.ltvOnRoad ? `${app.ltvOnRoad}%` : "Not worked out"} />
              <LabelValue label="Rules not met" value={`${failedChecks.length} of ${(app.ruleChecks ?? []).length}`} />
            </div>
            {failedChecks.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {failedChecks.map((c) => (
                  <li key={c.rule} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {c.rule}: {c.actual || "missing"} (needs {c.expected})
                  </li>
                ))}
              </ul>
            )}
          </Collapsible>
          ) : (
          <Collapsible title="Assessment Breakdown" defaultOpen>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelValue label="Decision" value={assessment.decision.decision} />
              <LabelValue label="Suggested rate" value={`${assessment.decision.suggestedRate}%`} />
              <LabelValue label="Hard filters" value={assessment.hardFilters.passed ? "Passed" : "Failed"} />
              <LabelValue label="Bureau band" value={assessment.bureau.band} />
              <LabelValue label="FOIR (engine)" value={`${assessment.income.foir}%`} />
              <LabelValue label="LTV breached" value={assessment.ltv.breached ? "Yes" : "No"} />
            </div>
            {assessment.decision.reasons.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {assessment.decision.reasons.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </Collapsible>
          )}

          {sample && assessment.bureau.flags.length > 0 && (
            <Collapsible title="Bureau Red Flags" defaultOpen right={
              <Pill tone="warning">{assessment.bureau.flags.length} flag{assessment.bureau.flags.length === 1 ? "" : "s"}</Pill>
            }>
              <ul className="space-y-2">
                {assessment.bureau.flags.map((flag) => {
                  const serious = /SMA-2|high risk|60\+|Thin file|Undeclared|EMI mismatch|FOIR recalculated/.test(flag);
                  return (
                    <li key={flag} className="flex items-start gap-3 rounded-md border border-border p-3">
                      <Pill tone={serious ? "warning" : "muted"}>{serious ? "REVIEW" : "NOTE"}</Pill>
                      <p className="text-sm">{flag}</p>
                    </li>
                  );
                })}
              </ul>
            </Collapsible>
          )}

          {sample && fraudCheck.flags.length > 0 && (
            <Collapsible title="Risk Flags" defaultOpen right={
              fraudCheck.hasCritical ? <Pill tone="destructive">Critical</Pill> : <Pill tone="warning">{fraudCheck.flags.length} flags</Pill>
            }>
              <ul className="space-y-2">
                {fraudCheck.flags.map((flag) => (
                  <li key={flag.code} className="flex items-start gap-3 rounded-md border border-border p-3">
                    <Pill tone={flag.severity === "HIGH" ? "destructive" : flag.severity === "MEDIUM" ? "warning" : "muted"}>
                      {flag.severity}
                    </Pill>
                    <div>
                      <p className="text-sm font-medium">{flag.code}</p>
                      <p className="text-xs text-muted-foreground">{flag.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}

          <Collapsible title="Customer Profile" defaultOpen={true}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelValue label="Name" value={app.name} />
              <LabelValue label="Age" value={`${app.age} years`} />
              <LabelValue label="PAN" value={app.pan} />
              <LabelValue label="Aadhaar" value={app.aadhaar} />
              <LabelValue label="Phone" value={app.phone} />
              <LabelValue label="Email" value={app.email} />
              <LabelValue label="Address" value={app.address} />
              <LabelValue label="City / State" value={`${app.city}, ${app.state}`} />
              <LabelValue label="Residence" value={app.residence} />
            </div>
          </Collapsible>

          {sample ? (
          <Collapsible title="Income Assessment">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-right font-medium">Monthly amount</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeSources.map((s) => (
                    <tr key={s.source} className="border-t border-border">
                      <td className="px-3 py-2">{s.source}</td>
                      <td className="px-3 py-2 text-right tabular">{inr(s.amount)}</td>
                      <td className="px-3 py-2">
                        <Pill tone="success">{s.status}</Pill>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-surface-subtle font-semibold">
                    <td className="px-3 py-2">Computed net income</td>
                    <td className="px-3 py-2 text-right tabular">{inr(computedIncome)}</td>
                    <td className="px-3 py-2 text-xs">Used for FOIR</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p
              className={cn(
                "mt-3 flex items-center gap-2 text-sm",
                variance <= 5 ? "text-success" : "text-destructive",
              )}
            >
              {variance <= 5 ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
              {variance.toFixed(1)}% variance across sources —{" "}
              {variance <= 5 ? "within 5% threshold" : "salary mismatch, manual review required"}
            </p>
          </Collapsible>
          ) : (
          <Collapsible title="Income Assessment">
            <p className="text-sm">
              Declared net monthly income: <span className="font-semibold tabular">{inr(app.netIncome)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Salary slips, Form 16 and the bank statement are compared on the Income and bank card and the Banking tab.
            </p>
          </Collapsible>
          )}

          {sample && (
          <Collapsible title="Cross-Document Income Validation">
            <IncomeComparison
              incomes={[
                { source: "salary_slip", monthlyGross: app.netIncome * 1.25, annualGross: app.netIncome * 15, monthlyNet: app.netIncome },
                { source: "form_16", monthlyGross: app.netIncome * 1.22, annualGross: app.netIncome * 14.64, monthlyNet: app.netIncome * 0.98 },
                { source: "bank_statement", monthlyGross: app.netIncome * 1.2, annualGross: app.netIncome * 14.4, monthlyNet: app.netIncome * 0.97 },
              ]}
            />
          </Collapsible>
          )}

          <Collapsible title="Bureau Summary" defaultOpen>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="sm:w-48">
                <p className="text-xs text-muted-foreground">CIBIL Score</p>
                <p
                  className={cn(
                    "text-4xl font-semibold tabular",
                    app.cibil >= 750
                      ? "text-success"
                      : app.cibil >= 650
                        ? "text-warning"
                        : "text-destructive",
                  )}
                >
                  {app.cibil}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gradient-to-r from-destructive via-warning to-success">
                  <div
                    className="h-full w-0.5 bg-foreground"
                    style={{ marginLeft: `${((app.cibil - 300) / 600) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">300 — 900</p>
              </div>
              {sample ? (
              <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {bureauMetrics.map(([label, value]) => (
                  <LabelValue key={label} label={label} value={value} />
                ))}
              </div>
              ) : (
                <p className="flex-1 text-sm text-muted-foreground">Accounts, enquiries and late payments are on the Bureau tab.</p>
              )}
            </div>

            {sample && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                DPD history — last 12 months
              </p>
              <div className="space-y-1.5">
                {dpdHistory.map((row) => (
                  <div key={row.account} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 truncate text-xs">{row.account}</span>
                    <div className="flex flex-1 gap-1">
                      {row.months.map((m, i) => (
                        <span
                          key={i}
                          title={`M-${12 - i}: ${m}`}
                          className={cn(
                            "h-4 flex-1 rounded-sm",
                            m === "0" ? "bg-success/40" : "bg-warning",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
          </Collapsible>

          <Collapsible title="Obligations & FOIR" defaultOpen>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Lender</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">EMI</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-3 py-2 text-right font-medium">DPD</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {app.obligations.map((o) => (
                    <tr key={o.lender + o.type} className="border-t border-border">
                      <td className="px-3 py-2">{o.lender}</td>
                      <td className="px-3 py-2">{o.type}</td>
                      <td className="px-3 py-2 text-right tabular">{inr(o.emi)}</td>
                      <td className="px-3 py-2 text-right tabular">{inr(o.outstanding)}</td>
                      <td className="px-3 py-2 text-right tabular">{o.dpd}</td>
                      <td className="px-3 py-2 text-muted-foreground">{o.source}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-surface-subtle font-semibold">
                    <td className="px-3 py-2">Proposed</td>
                    <td className="px-3 py-2">Car Loan</td>
                    <td className="px-3 py-2 text-right tabular">{inr(emi)}</td>
                    <td className="px-3 py-2 text-right tabular">{inr(Number(amount) || 0)}</td>
                    <td className="px-3 py-2 text-right">—</td>
                    <td className="px-3 py-2">This application</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabelValue label="Total existing EMIs" value={inr(existingEmis)} />
              <LabelValue label="Proposed EMI" value={inr(emi)} />
              <LabelValue label="Total obligations" value={inr(totalObligations)} />
              <LabelValue label="Net monthly income" value={inr(app.netIncome)} />
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium">FOIR</span>
                <span
                  className={cn(
                    "font-semibold tabular",
                    foir > 50 ? "text-destructive" : "text-success",
                  )}
                >
                  {foir.toFixed(1)}%
                </span>
              </div>
              <MeterBar
                value={foir}
                max={80}
                threshold={50}
                tone={foir > 55 ? "destructive" : foir > 50 ? "warning" : "success"}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Threshold marker at 50%</p>
            </div>
          </Collapsible>

          {sample && (
          <Collapsible title="Income & Affordability (Engine)">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelValue
                label="Declared monthly income"
                value={inr(incomeAssessment.declaredMonthlyIncome)}
              />
              <LabelValue
                label="Verified monthly income"
                value={inr(incomeAssessment.verifiedMonthlyIncome)}
              />
              <LabelValue
                label="Income variance"
                value={
                  <span className={incomeAssessment.incomeVarianceFlag ? "text-destructive" : "text-success"}>
                    {incomeAssessment.incomeVariancePct}%
                    {incomeAssessment.incomeVarianceFlag && " — exceeds 10%"}
                  </span>
                }
              />
              <LabelValue label="Net monthly income" value={inr(incomeAssessment.netMonthlyIncome)} />
              <LabelValue label="Existing EMI total" value={inr(incomeAssessment.existingEmiTotal)} />
              <LabelValue label="Proposed EMI" value={inr(incomeAssessment.proposedEmi)} />
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">FOIR</span>
                  <span
                    className={cn(
                      "font-semibold tabular",
                      incomeAssessment.foir > 65
                        ? "text-destructive"
                        : incomeAssessment.foir > 50
                          ? "text-warning"
                          : "text-success",
                    )}
                  >
                    {incomeAssessment.foir}%
                  </span>
                </div>
                <MeterBar
                  value={incomeAssessment.foir}
                  max={80}
                  threshold={50}
                  tone={
                    incomeAssessment.foir > 65
                      ? "destructive"
                      : incomeAssessment.foir > 50
                        ? "warning"
                        : "success"
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Green &lt;50% · Amber 50-65% · Red &gt;65%
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <LabelValue label="DBR" value={`${incomeAssessment.dbr}%`} />
                <LabelValue
                  label="Net surplus after EMIs"
                  value={
                    <span className={incomeAssessment.netSurplus >= 0 ? "text-success" : "text-destructive"}>
                      {inr(incomeAssessment.netSurplus)}
                    </span>
                  }
                />
              </div>
            </div>
          </Collapsible>
          )}

          <Collapsible title="Vehicle & LTV">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelValue label="Vehicle" value={app.vehicle} />
              <LabelValue label="Dealer" value={app.dealer} />
              <LabelValue label="Ex-showroom" value={inr(app.exShowroom)} />
              <LabelValue label="On-road" value={inr(app.onRoad)} />
              <LabelValue label="Loan amount" value={inr(Number(amount) || 0)} />
              <LabelValue
                label="Down payment"
                value={inr(Math.max(0, app.onRoad - (Number(amount) || 0)))}
              />
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>LTV on ex-showroom</span>
                  <span className="font-semibold tabular">{app.ltvExShowroom}%</span>
                </div>
                <MeterBar value={app.ltvExShowroom} max={150} threshold={120} tone="success" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>LTV on on-road</span>
                  <span className="font-semibold tabular">{app.ltvOnRoad}%</span>
                </div>
                <MeterBar value={app.ltvOnRoad} max={150} threshold={100} tone="success" />
              </div>
            </div>
          </Collapsible>

          {sample && (
          <Collapsible title="LTV Assessment (Engine)">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>LTV on ex-showroom</span>
                  <span
                    className={cn(
                      "font-semibold tabular",
                      ltvAssessment.breached ? "text-destructive" : "text-success",
                    )}
                  >
                    {ltvAssessment.ltvExShowroom}%
                  </span>
                </div>
                <MeterBar
                  value={ltvAssessment.ltvExShowroom}
                  max={150}
                  threshold={ltvAssessment.maxAllowedLtv}
                  tone={ltvAssessment.breached ? "destructive" : "success"}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>LTV on on-road</span>
                  <span className="font-semibold tabular">{ltvAssessment.ltvOnRoad}%</span>
                </div>
                <MeterBar
                  value={ltvAssessment.ltvOnRoad}
                  max={150}
                  threshold={100}
                  tone={ltvAssessment.ltvOnRoad > 100 ? "destructive" : "success"}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <LabelValue
                  label="Max allowed LTV"
                  value={ltvAssessment.categoryLabel}
                />
                <LabelValue
                  label="LTV check"
                  value={
                    ltvAssessment.breached ? (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <X className="size-4" /> Breached
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-success">
                        <Check className="size-4" /> Pass
                      </span>
                    )
                  }
                />
              </div>
            </div>
          </Collapsible>
          )}

          <Collapsible title="Policy Check Results">
            {checks.length === 0 && (
              <p className="text-sm text-muted-foreground">The credit rules have not been run on this case yet.</p>
            )}
            <ul className="divide-y divide-border">
              {checks.map((check) => (
                <li
                  key={check.rule}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="font-medium">{check.rule}</span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span className="text-xs">Expected {check.expected}</span>
                    <span className="tabular text-foreground">{check.actual}</span>
                    {check.pass ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <X className="size-4 text-destructive" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Collapsible>

          <Collapsible title="Employer & Stability">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelValue
                label="Employer"
                value={
                  <span className="flex items-center gap-2">
                    <CategoryBadge category={app.category} /> {app.employer}
                  </span>
                }
              />
              <LabelValue label="Designation" value={app.designation} />
              <LabelValue label="Total experience" value={app.totalExperience} />
              <LabelValue label="Current tenure" value={app.currentTenure} />
              <LabelValue label="Salary account" value={app.salaryBank} />
              <LabelValue label="Category" value={`Category ${app.category}`} />
            </div>
            {!employerCheck.allMatch && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-semibold">Employer mismatch detected</p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {employerCheck.mismatches.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </Collapsible>
        </div>

        <div className="min-w-0 space-y-4">
          {sample && (
          <SectionCard title="Documents" description={`${documents.length} files`}>
            <ul className="space-y-2">
              {documents.map((doc) => {
                const open = openDoc === doc.name;
                return (
                  <li key={doc.name} className="rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setOpenDoc(open ? null : doc.name)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{doc.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {doc.confidence > 0 && (
                          <span className="text-xs text-muted-foreground tabular">
                            {doc.confidence}%
                          </span>
                        )}
                        <Pill
                          tone={
                            doc.status === "Extracted"
                              ? "success"
                              : doc.status === "Processing"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {doc.status}
                        </Pill>
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-border px-3 py-2">
                        <dl className="space-y-1 text-xs">
                          {doc.fields.map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">{k}</dt>
                              <dd className="text-right font-medium">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <button className="mt-2 text-xs text-primary hover:underline">
                          View original
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          )}

          {sample && (
          <SectionCard title="Cross-Document Verification">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start justify-between gap-3">
                <span>
                  Name match
                  <span className="block text-xs text-muted-foreground">
                    PAN · Aadhaar · Salary slip · Bank
                  </span>
                </span>
                <Pill tone="success">All match</Pill>
              </li>
              <li className="flex items-start justify-between gap-3">
                <span>
                  Employer match
                  <span className="block text-xs text-muted-foreground">
                    Salary slip · Form 16 · Bank narration
                  </span>
                </span>
                <Pill tone="success">All match</Pill>
              </li>
              <li className="flex items-start justify-between gap-3">
                <span>
                  Salary consistency
                  <span className="block text-xs text-muted-foreground">
                    {variance.toFixed(1)}% variance
                  </span>
                </span>
                <Pill tone={variance <= 5 ? "success" : "destructive"}>
                  {variance <= 5 ? "Within threshold" : "Mismatch"}
                </Pill>
              </li>
            </ul>
          </SectionCard>
          )}

          <SectionCard
            title="Proposed terms"
            description={canDecide && !locked ? "Adjust the terms, then decide" : "Terms on this case"}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="terms-amount" className="text-xs text-muted-foreground">Loan amount (Rs)</Label>
                <Input id="terms-amount" value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Interest rate</Label>
                  <Select value={rate} onValueChange={setRate} disabled={locked}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a rate" />
                    </SelectTrigger>
                    <SelectContent>
                      {rateOptions.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}%{r === engineRate ? " (engine rate)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tenure</Label>
                  <Select value={tenure} onValueChange={setTenure} disabled={locked}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[12, 24, 36, 48, 60, 72, 84].map((t) => (
                        <SelectItem key={t} value={String(t)}>
                          {t} months
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LabelValue label="EMI (auto-calculated)" value={inr(emi)} />
                <div className="space-y-1.5">
                  <Label htmlFor="terms-fee" className="text-xs text-muted-foreground">Processing fee (Rs)</Label>
                  <Input id="terms-fee" defaultValue="5000" disabled={locked} />
                </div>
              </div>

              {!locked && changing && (
                <div className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <Label htmlFor="terms-change-reason" className="text-xs font-semibold">
                    Why change the decision on this {app.status.toLowerCase()} case? (required, kept in the audit trail)
                  </Label>
                  <Textarea id="terms-change-reason" rows={2} placeholder="e.g. Customer's salary account moved to us, re-approving at 9.25%" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={() => { setChanging(false); setChangeReason(""); setRate(engineRate); }}>
                    Cancel the change
                  </Button>
                </div>
              )}
              {decided && !result && !changing && (
                app.status === "Disbursed" ? (
                  <p className="text-xs text-muted-foreground">This loan is disbursed, so the decision can no longer be changed.</p>
                ) : changeable ? (
                  <Button variant="outline" className="w-full" onClick={() => setChanging(true)}>
                    Change decision
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">This case is decided. Only the Credit Head can change the decision.</p>
                )
              )}
              {canDecide && !locked && (
                <>
                  {rateChanged && (
                    <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-3">
                      <Label htmlFor="terms-rate-reason" className="text-xs font-semibold">
                        Why {rate}% instead of the engine rate {engineRate}%? (required)
                      </Label>
                      <Textarea id="terms-rate-reason" rows={2} placeholder="e.g. Long relationship, salary account with us" value={rateReason} onChange={(e) => setRateReason(e.target.value)} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="terms-notes" className="text-xs text-muted-foreground">
                      Conditions or notes (needed when sending for review)
                    </Label>
                    <Textarea id="terms-notes" rows={2} placeholder={manager ? "What the credit officer should look at" : "e.g. Post-dated cheques for the first 3 EMIs, or what the manager should look at"} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Reason code (needed to reject)</Label>
                    <Select value={rejectReason} onValueChange={setRejectReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Low CIBIL", "High FOIR", "Employment Instability", "Document Mismatch", "Fraud Suspicion", "Other"].map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="terms-override" className="text-xs text-muted-foreground">
                      {app.recommendation === "Approve"
                        ? "Override reason (needed only to reject, since the AI said Approve)"
                        : `Override reason (needed to approve or reject: the AI said ${app.recommendation})`}
                    </Label>
                    <Textarea id="terms-override" rows={2} placeholder="Explain the deviation" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      className="bg-success text-success-foreground hover:bg-success/90"
                      disabled={submitting}
                      onClick={() => void decide("APPROVE")}
                    >
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : rateChanged ? `Approve at ${rate}%` : "Approve"}
                    </Button>
                    <Button variant="destructive" disabled={submitting} onClick={() => void decide("REJECT")}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : "Reject"}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-warning text-warning-foreground dark:text-warning"
                      disabled={submitting}
                      onClick={() => void decide("MAYBE")}
                    >
                      {manager ? "Return to officer" : "Send for review"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Downloads" description="Unlock as the case moves forward">
            {currentStatus === "Rejected" ? (
              <p className="text-xs text-muted-foreground">This application was rejected, so no letters can be issued.</p>
            ) : (
              <ul className="space-y-2">
                {[
                  { label: "Approval letter", to: "/applications/$id/approval" as const, open: approvedNow, hint: "After the case is approved" },
                  { label: "Sanction letter", to: "/applications/$id/sanction" as const, open: approvedNow, hint: "After the case is approved" },
                ].map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <span className="text-sm">
                      {d.label}
                      {!d.open && <span className="block text-xs text-muted-foreground">{d.hint}</span>}
                    </span>
                    {d.open ? (
                      <Button size="sm" variant="outline" asChild>
                        <Link to={d.to} params={{ id: app.id }}>Open</Link>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled>Locked</Button>
                    )}
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <span className="text-sm">
                    Delivery order
                    <span className="block text-xs text-muted-foreground">
                      After the customer accepts and the delivery and dealer payment dates are entered
                    </span>
                  </span>
                  <Button size="sm" variant="outline" disabled>Locked</Button>
                </li>
              </ul>
            )}
          </SectionCard>

          {manager && sample && (
            <SectionCard title="Override History">
              <ul className="space-y-3 text-sm">
                {overrideHistory.map((o) => (
                  <li key={o.when} className="rounded-md border border-border p-3">
                    <p className="font-medium">{o.what}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {o.who} · {o.when}
                    </p>
                    <p className="mt-1.5 text-xs">{o.why}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {sample && (
          <SectionCard title="Activity Log">
            <ol className="relative space-y-4 border-l border-border pl-4">
              {activityLog.map((entry) => (
                <li key={entry.text} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
                  <p className="text-sm">{entry.text}</p>
                  <p className="text-xs text-muted-foreground">{entry.time}</p>
                </li>
              ))}
            </ol>
          </SectionCard>
          )}
        </div>
      </div>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {result?.decision === "APPROVE" && "Application approved"}
              {result?.decision === "REJECT" && "Application rejected"}
              {result?.decision === "MAYBE" && "Application referred"}
            </DialogTitle>
            <DialogDescription>{result?.message}</DialogDescription>
          </DialogHeader>
          {result?.decision === "APPROVE" && (
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <LabelValue label="Sanctioned amount" value={inr(result.sanctionedAmount)} />
              <LabelValue label="Rate" value={`${result.sanctionedRate}%`} />
              <LabelValue label="Tenure" value={`${result.sanctionedTenure} months`} />
              <LabelValue label="EMI" value={inr(result.sanctionedEmi)} />
            </div>
          )}
          {result?.isOverride && (
            <p className="text-xs text-warning">This decision overrides the AI recommendation and has been logged.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowResult(false); navigate({ to: "/applications" }); }}>
              Back to queue
            </Button>
            {result?.decision === "APPROVE" && (
              <>
                <Button variant="outline" asChild>
                  <Link to="/applications/$id/approval" params={{ id: app.id }}>
                    Approval letter
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/applications/$id/sanction" params={{ id: app.id }}>
                    Sanction letter
                  </Link>
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
