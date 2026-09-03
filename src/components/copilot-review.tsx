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
import { useState } from "react";

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
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [decision, setDecision] = useState("Approve");
  const [amount, setAmount] = useState(String(app.loanAmount));
  const [rate, setRate] = useState(String(app.rate));
  const [tenure, setTenure] = useState(String(app.tenure));
  const [remarks, setRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OfficerDecisionResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  async function handleDecisionSubmit(quickDecision?: "APPROVE" | "REJECT") {
    const finalDecision = quickDecision || decision.toUpperCase();
    setSubmitting(true);
    const payload: Parameters<typeof submitOfficerDecision>[0] = {
      applicationId: app.id,
      decision: finalDecision as "APPROVE" | "REJECT" | "MAYBE",
    };
    if (remarks) payload.remarks = remarks;
    if (rejectReason) payload.reasonCodes = [rejectReason];
    if (Number(amount)) payload.sanctionedAmount = Number(amount);
    if (Number(rate)) payload.sanctionedRate = Number(rate);
    if (Number(tenure)) payload.sanctionedTenure = Number(tenure);
    if (overrideReason) payload.overrideReason = overrideReason;
    const res = await submitOfficerDecision(payload);
    setSubmitting(false);
    if (res) {
      toast.success("Decision recorded: " + res.decision);
    } else if (!res && false) {
      // no toast for demo mode when res is null (dialog handles it)
    } else if (!res) {
      toast.error("Failed to submit decision");
    }
    if (res) {
      setResult(res);
      setShowResult(true);
    }
  }

  const emi = emiFor(Number(amount) || 0, Number(rate) || 0, Number(tenure) || 60);
  const existingEmis = app.obligations.reduce((s, o) => s + o.emi, 0);
  const totalObligations = existingEmis + emi;
  const foir = (totalObligations / app.netIncome) * 100;
  const computedIncome = Math.min(...incomeSources.map((s) => s.amount));
  const variance =
    ((Math.max(...incomeSources.map((s) => s.amount)) - computedIncome) / computedIncome) * 100;
  const overrideNeeded = decision !== app.recommendation;

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
          {manager && <Pill tone="primary">Delegation authority: up to Rs 25,00,000</Pill>}
          <Button
            className="bg-success text-success-foreground hover:bg-success/90"
            disabled={submitting}
            onClick={() => handleDecisionSubmit("APPROVE")}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
          </Button>
          <Button
            variant="destructive"
            disabled={submitting}
            onClick={() => handleDecisionSubmit("REJECT")}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Reject"}
          </Button>
          <Button variant="outline" className="border-warning text-warning-foreground dark:text-warning">
            {manager ? "Return to officer" : "Send for review"}
          </Button>
        </div>
      </div>

      {/* Key metrics strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CIBIL</p>
          <p className={cn(
            "mt-1 text-2xl font-bold tabular tracking-tight",
            app.cibil >= 750 ? "text-success" : app.cibil >= 650 ? "text-warning" : "text-destructive",
          )}>{app.cibil}</p>
          <p className="text-[11px] text-muted-foreground">{app.cibil >= 750 ? "Above threshold" : app.cibil >= 650 ? "Marginal" : "Below threshold"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">FOIR</p>
          <p className={cn(
            "mt-1 text-2xl font-bold tabular tracking-tight",
            foir > 50 ? "text-destructive" : "text-success",
          )}>{foir.toFixed(1)}%</p>
          <p className="text-[11px] text-muted-foreground">Threshold: 50%</p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">LTV (ex-showroom)</p>
          <p className="mt-1 text-2xl font-bold tabular tracking-tight">{app.ltvExShowroom}%</p>
          <p className="text-[11px] text-muted-foreground">Max: 120%</p>
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
                {app.recommendation === "Approve" &&
                  `Approve — ${inr(app.loanAmount)} at ${app.rate}% for ${app.tenure} months`}
                {app.recommendation === "Maybe" && "Maybe — manual review recommended"}
                {app.recommendation === "Reject" && "Reject — policy breach"}
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
              <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {bureauMetrics.map(([label, value]) => (
                  <LabelValue key={label} label={label} value={value} />
                ))}
              </div>
            </div>

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

          <Collapsible title="Policy Check Results">
            <ul className="divide-y divide-border">
              {policyChecks.map((check) => (
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
          </Collapsible>
        </div>

        <div className="min-w-0 space-y-4">
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

          <SectionCard title="Proposed Terms" description="Adjust before approving">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Loan amount (Rs)</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Interest rate</Label>
                  <Select value={rate} onValueChange={setRate}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["8.75", "8.99", "9.25", "9.5", "9.75", "10.25", "11.5"].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tenure</Label>
                  <Select value={tenure} onValueChange={setTenure}>
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
                  <Label className="text-xs text-muted-foreground">Processing fee (Rs)</Label>
                  <Input defaultValue="5000" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" asChild>
                  <Link to="/applications/$id/approval" params={{ id: app.id }}>
                    Approval letter
                  </Link>
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <Link to="/applications/$id/sanction" params={{ id: app.id }}>
                    Sanction letter
                  </Link>
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Decision">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Decision</Label>
                <Select value={decision} onValueChange={setDecision}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Approve">Approve</SelectItem>
                    <SelectItem value="Reject">Reject</SelectItem>
                    <SelectItem value="Maybe">
                      {manager ? "Return to credit officer" : "Refer to credit manager"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {decision === "Approve" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Conditions (optional)</Label>
                  <Textarea rows={3} placeholder="e.g. Post-dated cheques for first 3 EMIs" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </div>
              )}
              {decision === "Reject" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Reason codes</Label>
                  <Select value={rejectReason} onValueChange={setRejectReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "Low CIBIL",
                        "High FOIR",
                        "Employment Instability",
                        "Document Mismatch",
                        "Fraud Suspicion",
                        "Other",
                      ].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {decision === "Maybe" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {manager ? "Notes for credit officer" : "Notes for credit manager"}
                  </Label>
                  <Textarea rows={3} placeholder="Context for the reviewer" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </div>
              )}

              {overrideNeeded && (
                <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-3">
                  <Label className="text-xs font-semibold">
                    Override reason (required — differs from AI recommendation)
                  </Label>
                  <Textarea rows={2} placeholder="Explain the deviation" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                </div>
              )}

              <Button className="w-full" disabled={submitting} onClick={() => handleDecisionSubmit()}>
                {submitting ? <><Loader2 className="size-4 animate-spin" /> Submitting...</> : "Submit decision"}
              </Button>
            </div>
          </SectionCard>

          {manager && (
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
