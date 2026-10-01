import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CircleDashed,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AppShell, LabelValue, SectionCard } from "@/components/app-shell";
import { BureauDetailCard } from "@/components/bureau-detail";
import { IncomeDetailCard } from "@/components/income-detail";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { downloadPdf } from "@/lib/doc-pdf";
import { inr } from "@/lib/format";
import { disburse, getCaseLoan, issueOffer, type AfterApproval } from "@/lib/loan-api";
import { availableDocs } from "@/lib/loan-docs";
import {
  FACE_TEXT,
  STATUS_TEXT,
  caseAction,
  fileLink,
  getBureauDetail,
  getIncomeDetail,
  getCaseChecks,
  getCustomerCase,
  getDocumentChecks,
  rerunDocumentChecks,
  runCreditChecks,
  type BureauDetail,
  type IncomeDetail,
  type CaseAction,
  type CaseChecks,
  type CaseDocument,
  type CustomerCase,
  type DocCheck,
  type DocumentChecks,
} from "@/lib/staff-customer-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customer-applications/$id")({
  head: ({ params }) => ({ meta: [{ title: `${params.id} — cercit` }] }),
  component: CaseView,
});

const DOC_STATUS: Record<
  CaseDocument["status"],
  [string, "info" | "success" | "warning" | "muted" | "destructive"]
> = {
  MISSING: ["Missing", "muted"],
  RECEIVED: ["To check", "info"],
  ACCEPTED: ["Accepted", "success"],
  REUPLOAD: ["Asked again", "warning"],
  WAIVED: ["Waived", "muted"],
  NOT_NEEDED: ["Not needed", "muted"],
};

const STAGE_TEXT: Record<string, string> = {
  RECEIVED: "Submitted by the customer",
  DOCS_VERIFIED: "Documents checked",
  CREDIT_CHECK: "Credit check",
  DECISION: "Decision",
  SANCTION: "Sanction letter",
};

const FIELD_LABELS: Record<string, string> = {
  dob: "Date of birth",
  pan: "PAN",
  father_name: "Father's name",
  gender: "Gender",
  marital_status: "Marital status",
  permanent: "Permanent address",
  current_same: "Lives at permanent address",
  current: "Current address",
  residence: "Current home",
  owner_name: "House owner",
  owner_mobile: "Owner's mobile",
  years_at_current: "Years at current address",
  employer_name: "Employer",
  employer_category: "Kind of company",
  designation: "Designation",
  date_of_joining: "Joined",
  net_monthly_salary: "Monthly take-home",
  existing_emis: "EMIs paid now",
};
const GROUP_TITLES = {
  PERSONAL: "About the customer",
  ADDRESS: "Where they live",
  EMPLOYMENT: "Their work",
} as const;

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const a = v as Record<string, unknown>;
    return [a["line1"], a["line2"], a["city"], a["state_code"], a["pincode"]]
      .filter(Boolean)
      .join(", ");
  }
  if (key === "net_monthly_salary" || key === "existing_emis") return inr(Number(v));
  const text = String(v);
  // Stored codes (FEMALE, PRIVATE_LTD) read as words: "Female", "Private ltd".
  if (/^[A-Z][A-Z_]+$/.test(text))
    return text.charAt(0) + text.slice(1).toLowerCase().replaceAll("_", " ");
  return text;
}

function emi(principal: number, months: number, rate = 8.99) {
  const r = rate / 1200;
  return Math.round((principal * r * (1 + r) ** months) / ((1 + r) ** months - 1));
}

function CaseView() {
  const { id } = Route.useParams();
  const [c, setC] = useState<CustomerCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checks, setChecks] = useState<CaseChecks | null>(null);
  const [docChecks, setDocChecks] = useState<DocumentChecks | null>(null);
  const [bureau, setBureau] = useState<BureauDetail | null>(null);
  const [income, setIncome] = useState<IncomeDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setC(await getCustomerCase(id));
      setChecks(await getCaseChecks(id).catch(() => null));
      setDocChecks(await getDocumentChecks(id).catch(() => null));
      // Two-bureau detail (sql/053). Missing before 053 runs: the card then shows nothing.
      setBureau(await getBureauDetail(id).catch(() => null));
      // Income and bank detail (sql/054). Missing before 054 runs: no card.
      setIncome(await getIncomeDetail(id).catch(() => null));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  const runChecks = async () => {
    setBusy("CHECKS");
    setActionError(null);
    try {
      await runCreditChecks(id);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    void load();
  }, [load]);

  const rerunChecks = async () => {
    setBusy("AUTO");
    setActionError(null);
    try {
      await rerunDocumentChecks(id);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: CaseAction, p: Record<string, unknown> = {}, tag: string = action) => {
    setBusy(tag);
    setActionError(null);
    try {
      await caseAction(id, action, p);
      await load();
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <AppShell title="Customer application">
        <p className="text-sm text-destructive">{error}</p>
      </AppShell>
    );
  }
  if (!c) {
    return (
      <AppShell title="Customer application">
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  const a = c.application;
  const [stage, tone] = STATUS_TEXT[a.status] ?? [a.status, "muted" as const];
  const needed = c.documents.filter((d) => d.required === "ALWAYS");
  const notAccepted = needed.filter((d) => d.status !== "ACCEPTED" && d.status !== "WAIVED");
  const quoteIn = c.documents.some(
    (d) => d.doc_type === "QUOTE" && (d.status === "RECEIVED" || d.status === "ACCEPTED"),
  );
  const open =
    ["SUBMITTED", "UNDER_ASSESSMENT", "UNDER_REVIEW"].includes(a.status) ||
    (a.status === "APPROVED" && a.approval_stage === "IN_PRINCIPLE");

  return (
    <AppShell
      title={c.customer.full_name}
      subtitle={`${a.application_id} · submitted ${when(a.submitted_at)}${a.officer ? ` · ${a.officer}` : ""}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={tone}>{stage}</Pill>
          {docChecks?.summary?.fast_lane && (
            <Pill tone="success">
              <Zap className="size-3" aria-hidden="true" /> Fast lane
            </Pill>
          )}
          {a.approval_stage === "IN_PRINCIPLE" && <Pill tone="muted">In-principle</Pill>}
          {open && !a.assigned_to_me && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void act("ASSIGN_TO_ME")}
            >
              Take this case
            </Button>
          )}
        </div>
      }
    >
      <Link
        to="/customer-applications"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Customer applications
      </Link>

      {actionError && (
        <p
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {(a.status === "APPROVED" && a.approval_stage === "FINAL") || a.status === "DISBURSED" ? (
        <AfterApprovalPanel id={id} onChange={load} />
      ) : (
        <NextStep
          c={c}
          checks={checks}
          notAccepted={notAccepted}
          quoteIn={quoteIn}
          busy={busy}
          act={act}
          runChecks={runChecks}
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* min-w-0: wide tables scroll inside their cards instead of widening the column on phones. */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {checks?.recommendation && <CreditChecksCard checks={checks} />}
          {bureau?.detail && <BureauDetailCard data={bureau} />}
          {income?.detail && <IncomeDetailCard data={income} />}
          <SectionCard
            title="Documents"
            description={
              docChecks?.enabled
                ? "Checked automatically against the customer's details. Look only at the ones marked to check; accept them or ask the customer again."
                : "Open each file, then accept it or ask the customer again. The customer sees your reason."
            }
          >
            {docChecks?.enabled && (
              <AutoCheckSummary
                checks={docChecks}
                docs={c.documents}
                open={open}
                busy={busy}
                rerun={() => void rerunChecks()}
              />
            )}
            <ul className="divide-y divide-border">
              {c.documents.map((d) => (
                <DocumentLine
                  key={d.doc_type}
                  app={a.application_id}
                  d={d}
                  open={open}
                  busy={busy}
                  act={act}
                  checks={docChecks?.documents[d.doc_type]}
                  autoAccepted={docChecks?.auto_accepted.includes(d.doc_type) ?? false}
                />
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Details check"
            description="What the documents said next to what the customer confirmed. Highlighted rows were changed by the customer."
          >
            <div className="space-y-5">
              {(Object.keys(GROUP_TITLES) as (keyof typeof GROUP_TITLES)[]).map((g) => {
                const group = c.groups[g];
                if (!group) return null;
                const keys = Object.keys(group.confirmed).filter((k) => k in FIELD_LABELS);
                return (
                  <div key={g}>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {GROUP_TITLES[g]}
                      {group.edited.length > 0 && (
                        <Pill tone="warning">{group.edited.length} changed</Pill>
                      )}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="w-1/4 py-1 pr-3 font-medium">Field</th>
                            <th className="w-3/8 py-1 pr-3 font-medium">From the documents</th>
                            <th className="py-1 font-medium">Customer confirmed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keys.map((k) => {
                            const edited = group.edited.includes(k);
                            return (
                              <tr
                                key={k}
                                className={cn("border-t border-border", edited && "bg-warning/10")}
                              >
                                <td className="py-1.5 pr-3 text-muted-foreground">
                                  {FIELD_LABELS[k]}
                                </td>
                                <td className="py-1.5 pr-3">
                                  {k in group.prefilled ? (
                                    show(k, group.prefilled[k])
                                  ) : (
                                    <span className="text-muted-foreground">not read</span>
                                  )}
                                </td>
                                <td className={cn("py-1.5", edited && "font-medium")}>
                                  {show(k, group.confirmed[k])}
                                  {edited && (
                                    <TriangleAlert
                                      className="ml-1.5 inline size-3.5 text-warning"
                                      aria-label="Changed by the customer"
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <VehicleCard vehicle={c.vehicle} salary={a.declared_net_salary} />
        </div>

        <div className="space-y-4">
          <SectionCard title="Customer">
            <div className="grid grid-cols-2 gap-3">
              <LabelValue label="Email" value={c.customer.email} />
              <LabelValue
                label="Mobile"
                value={
                  <>
                    {c.customer.mobile}
                    {c.customer.mobile_check === "SIMULATED" && (
                      <span className="block text-xs font-normal text-warning-foreground dark:text-warning">
                        OTP simulated (demo)
                      </span>
                    )}
                  </>
                }
              />
              <LabelValue label="PAN" value={c.customer.pan ?? "—"} />
              <LabelValue label="Age" value={c.customer.age ?? "—"} />
            </div>
          </SectionCard>

          <SectionCard
            title="Face match"
            description="Live photo against the ID photos. 90%+ match, 70–90% check by eye."
          >
            {c.face.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not run yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.face.map((f) => (
                  <li key={f.doc_type} className="flex items-center justify-between gap-2">
                    <span>{f.doc_type === "PAN" ? "PAN card" : "Aadhaar"}</span>
                    <span className="flex items-center gap-2">
                      {f.similarity !== null && (
                        <span className="tabular-nums text-muted-foreground">
                          {Number(f.similarity).toFixed(1)}%
                        </span>
                      )}
                      <Pill tone={FACE_TEXT[f.result][1]}>{FACE_TEXT[f.result][0]}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Consents">
            <ul className="space-y-1.5 text-sm">
              {c.consents.map((x) => (
                <li key={x.purpose + x.given_at} className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                  {x.purpose === "BUREAU_PULL" ? "Credit bureau check" : "Application processing"}
                  <span className="ml-auto text-xs text-muted-foreground">{when(x.given_at)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <NoteBox busy={busy} act={act} />

          <SectionCard title="History">
            <ol className="space-y-2 text-sm">
              {c.history.slice(0, 25).map((h, i) => (
                <li key={i} className="border-l-2 border-border pl-3">
                  <p>{historyText(h.event, h.detail)}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.by ??
                      (h.actor === "CUSTOMER"
                        ? "Customer"
                        : h.actor === "SYSTEM"
                          ? "System"
                          : "Staff")}{" "}
                    · {when(h.at)}
                  </p>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}

function historyText(event: string, d: Record<string, unknown>): string {
  const doc = d["doc_type"] ? String(d["doc_type"]).replaceAll("_", " ").toLowerCase() : "";
  switch (event) {
    case "DOCUMENT_UPLOADED":
      return `Uploaded ${doc}${d["after_submit"] ? " (after submitting)" : ""}`;
    case "OFFICER_ACCEPT_DOC":
      return `Accepted ${doc}`;
    case "OFFICER_REQUEST_DOC":
      return `Asked again for ${doc}: ${String(d["note"] ?? "")}`;
    case "OFFICER_DOCS_VERIFIED":
      return "Documents checked, credit check started";
    case "OFFICER_DECIDE":
      return `Decision: ${String(d["decision"] ?? "").toLowerCase()}${d["note"] ? `: ${String(d["note"])}` : ""}`;
    case "OFFICER_MOVE_TO_FINAL":
      return "Moved to final approval";
    case "OFFICER_ASSIGN_TO_ME":
      return "Took the case";
    case "OFFICER_NOTE":
      return `Note: ${String(d["note"] ?? "")}`;
    case "DETAILS_CONFIRMED":
      return `Confirmed ${String(d["group"] ?? "").toLowerCase()} details`;
    case "APPLICATION_SUBMITTED":
      return "Submitted";
    case "FACE_MATCH_CHECKED":
      return `Face match on ${doc}: ${String(d["result"] ?? "").toLowerCase()}`;
    default:
      return event.replaceAll("_", " ").toLowerCase();
  }
}

// ---------------------------------------------------------------------------

type Act = (action: CaseAction, p?: Record<string, unknown>, tag?: string) => Promise<boolean>;

function NextStep({
  c,
  checks,
  notAccepted,
  quoteIn,
  busy,
  act,
  runChecks,
}: {
  c: CustomerCase;
  checks: CaseChecks | null;
  notAccepted: CaseDocument[];
  quoteIn: boolean;
  busy: string | null;
  act: Act;
  runChecks: () => Promise<void>;
}) {
  const rec = checks?.recommendation ?? null;
  const a = c.application;
  const [note, setNote] = useState("");

  let body: ReactNode = null;
  if (a.status === "SUBMITTED") {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {notAccepted.length === 0
            ? "Every needed document is accepted."
            : `${notAccepted.length} needed ${notAccepted.length === 1 ? "document is" : "documents are"} not accepted yet: ${notAccepted.map((d) => d.name).join(", ")}.`}
        </p>
        <Button
          disabled={busy !== null || notAccepted.length > 0}
          onClick={() => void act("DOCS_VERIFIED")}
        >
          {busy === "DOCS_VERIFIED" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}{" "}
          Documents OK, start the credit check
        </Button>
      </div>
    );
  } else if (a.status === "UNDER_ASSESSMENT" || a.status === "UNDER_REVIEW") {
    body = (
      <div className="space-y-3">
        <p className="text-sm">
          {a.status === "UNDER_REVIEW" ? "Referred for a second look. " : ""}
          Decide{" "}
          {a.approval_stage === "IN_PRINCIPLE"
            ? "in principle (the customer hasn't sent the quotation yet)"
            : "final approval"}
          . A reason is needed to refer or reject.
        </p>
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-subtle p-3 text-sm">
          {rec ? (
            <p>
              Engine recommends{" "}
              <span className="font-semibold">
                {rec.recommendation === "APPROVE"
                  ? "approve"
                  : rec.recommendation === "MAYBE"
                    ? "a closer look"
                    : "reject"}
              </span>
              {rec.recommended_rate ? ` at ${rec.recommended_rate}%` : ""}. Your decision is
              recorded against it.
            </p>
          ) : (
            <p>
              Run the credit checks first: bureau report, income and bank, then the policy engine.
            </p>
          )}
          <Button
            size="sm"
            variant={rec ? "ghost" : "default"}
            disabled={busy !== null}
            onClick={() => void runChecks()}
          >
            {busy === "CHECKS" && <Loader2 className="size-4 animate-spin" />}
            {rec ? "Run again" : "Run credit checks"}
          </Button>
        </div>
        <Textarea
          id="decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason or remarks (the customer does not see this)"
          rows={2}
        />
        <div className="flex flex-wrap gap-2">
          {(["APPROVE", "REFER", "REJECT"] as const).map((d) => (
            <Button
              key={d}
              variant={d === "APPROVE" ? "default" : d === "REJECT" ? "destructive" : "outline"}
              disabled={
                busy !== null ||
                (a.status === "UNDER_REVIEW" && d === "REFER") ||
                (d === "APPROVE" && !rec)
              }
              onClick={() =>
                void act("DECIDE", { decision: d, note }, d).then((ok) => ok && setNote(""))
              }
            >
              {busy === d && <Loader2 className="size-4 animate-spin" />}
              {d === "APPROVE"
                ? a.approval_stage === "IN_PRINCIPLE"
                  ? "Approve in principle"
                  : "Approve"
                : d === "REFER"
                  ? "Refer"
                  : "Reject"}
            </Button>
          ))}
        </div>
      </div>
    );
  } else if (a.status === "APPROVED" && a.approval_stage === "IN_PRINCIPLE") {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {quoteIn
            ? "The customer has sent the dealer's quotation."
            : "Approved in principle. Waiting for the customer to upload the dealer's quotation."}
        </p>
        <Button disabled={busy !== null || !quoteIn} onClick={() => void act("MOVE_TO_FINAL")}>
          Move to final approval
        </Button>
      </div>
    );
  } else {
    body = (
      <p className="text-sm text-muted-foreground">
        Decided {when(a.decided_at)}. Nothing more to do here.
      </p>
    );
  }
  return <section className="panel border-primary/30 p-4">{body}</section>;
}

function DocumentLine({
  app,
  d,
  open,
  busy,
  act,
  checks,
  autoAccepted,
}: {
  app: string;
  d: CaseDocument;
  open: boolean;
  busy: string | null;
  act: Act;
  checks?: DocCheck[] | undefined;
  autoAccepted: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [label, tone] = DOC_STATUS[d.status];

  async function view(key: string) {
    setLinkError(null);
    // Open the tab now, while the click still counts (after the await the browser
    // treats it as a pop-up and blocks it). Not "noopener": with it, window.open
    // returns null and the file could never be loaded into the tab.
    const w = window.open("", "_blank");
    if (w) {
      w.opener = null;
      w.document.title = "Opening file…";
      w.document.body.textContent = "Opening the file…";
    }
    try {
      const url = await fileLink(app, key);
      if (w) w.location.href = url;
      else if (!window.open(url, "_blank", "noopener"))
        setLinkError(
          "Your browser blocked the new tab. Allow pop-ups for this site and try again.",
        );
    } catch (e) {
      // Keep the tab and say why, instead of a tab that flashes and closes.
      const msg = `The file couldn't be opened: ${(e as Error).message}`;
      if (w) {
        w.document.title = "File not opened";
        w.document.body.textContent = msg;
      }
      setLinkError(msg);
    }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {d.name}
            <Pill tone={tone}>{label}</Pill>
            {d.required !== "ALWAYS" && (
              <span className="text-xs font-normal text-muted-foreground">
                {d.required === "OPTIONAL" ? "optional" : "if applicable"}
              </span>
            )}
          </p>
          {d.reason && d.status !== "ACCEPTED" && (
            <p className="mt-0.5 text-xs text-muted-foreground">{d.reason}</p>
          )}
          {d.status === "ACCEPTED" && autoAccepted && (
            <p className="mt-0.5 text-xs text-muted-foreground">Accepted automatically</p>
          )}
          {checks && checks.length > 0 && <CheckList checks={checks} />}
        </div>
        {open && d.status === "RECEIVED" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void act("ACCEPT_DOC", { doc_type: d.doc_type }, `accept-${d.doc_type}`)
              }
            >
              {busy === `accept-${d.doc_type}` ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}{" "}
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setAsking((x) => !x)}
            >
              <RotateCcw className="size-4" /> Ask again
            </Button>
          </div>
        )}
      </div>
      {d.files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.files.map((f) => (
            <li
              key={f.key}
              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            >
              <FileText className="size-3.5" aria-hidden="true" />
              <span className="font-medium text-foreground">
                {f.side === "single" ? "" : `${f.side}: `}
              </span>
              <span className="max-w-[16rem] truncate">{f.file_name}</span>
              <span>
                {Math.max(1, Math.round(f.size / 1024))} KB · {when(f.uploaded_at)}
              </span>
              {f.unlocked && (
                <span className="inline-flex items-center gap-0.5">
                  <Lock className="size-3" aria-hidden="true" /> opened with the customer's password
                </span>
              )}
              {f.was_locked && !f.unlocked && (
                <span className="text-warning-foreground dark:text-warning">
                  locked, not opened
                </span>
              )}
              {f.masked && <span>Aadhaar number masked</span>}
              {f.backend === "s3" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  onClick={() => void view(f.key)}
                >
                  Open <ExternalLink className="size-3" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {linkError && <p className="mt-1 text-xs text-destructive">{linkError}</p>}
      {asking && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act("REQUEST_DOC", { doc_type: d.doc_type, reason }, `ask-${d.doc_type}`).then(
              (ok) => ok && (setAsking(false), setReason("")),
            );
          }}
        >
          <Textarea
            id={`ask-${d.doc_type}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="What's wrong and what to send instead. The customer sees this, e.g. 'The back of the card is cut off. Upload a photo showing all four corners.'"
          />
          <Button size="sm" type="submit" disabled={busy !== null || reason.trim().length < 5}>
            Send to the customer
          </Button>
        </form>
      )}
    </li>
  );
}

function VehicleCard({
  vehicle,
  salary,
}: {
  vehicle: Record<string, unknown> | null;
  salary: number | null;
}) {
  if (!vehicle) return null;
  const n = (k: string) =>
    vehicle[k] === null || vehicle[k] === undefined ? null : Number(vehicle[k]);
  const onRoad = n("on_road") ?? n("ex_showroom");
  const loan = n("loan_amount_requested");
  const tenure = n("tenure_months");
  const ltv = loan && onRoad ? Math.round((loan / onRoad) * 100) : null;
  const instalment = loan && tenure ? emi(loan, tenure) : null;
  const foir = instalment && salary ? Math.round((instalment / Number(salary)) * 100) : null;
  return (
    <SectionCard
      title="Car and loan"
      description={
        vehicle["source"] === "MANUAL"
          ? "Typed by the customer; the quotation confirms it."
          : "From the dealer's quotation."
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <LabelValue
          label="Car"
          value={[vehicle["make"], vehicle["model"], vehicle["variant"]].filter(Boolean).join(" ")}
        />
        <LabelValue label="Dealer" value={String(vehicle["dealer_name"] ?? "—")} />
        <LabelValue label="Quote valid until" value={String(vehicle["valid_until"] ?? "—")} />
        <LabelValue label="Ex-showroom" value={n("ex_showroom") ? inr(n("ex_showroom")!) : "—"} />
        <LabelValue label="On-road" value={onRoad ? inr(onRoad) : "—"} />
        <LabelValue label="Loan asked" value={loan ? `${inr(loan)} over ${tenure} months` : "—"} />
        <LabelValue label="Loan to value" value={ltv !== null ? `${ltv}%` : "—"} />
        <LabelValue label="EMI at 8.99%" value={instalment ? inr(instalment) : "—"} />
        <LabelValue
          label="EMI to take-home"
          value={foir !== null ? `${foir}% (before other loans)` : "—"}
        />
      </div>
    </SectionCard>
  );
}

function NoteBox({ busy, act }: { busy: string | null; act: Act }) {
  const [note, setNote] = useState("");
  return (
    <SectionCard title="Internal note">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act("NOTE", { note }, "NOTE").then((ok) => ok && setNote(""));
        }}
      >
        <Textarea
          id="case-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Staff only"
        />
        <Button size="sm" variant="outline" type="submit" disabled={busy !== null || !note.trim()}>
          Add note
        </Button>
      </form>
    </SectionCard>
  );
}

const REC_TEXT = {
  APPROVE: ["Approve", "success"],
  MAYBE: ["Closer look", "warning"],
  REJECT: ["Reject", "destructive"],
} as const;

function CreditChecksCard({ checks }: { checks: CaseChecks }) {
  const b = checks.bureau;
  const i = checks.income;
  const k = checks.bank;
  const r = checks.recommendation!;
  const money = (v: number | null | undefined) =>
    v === null || v === undefined ? "not read" : inr(Number(v));
  const factors = Array.isArray(r.risk_factors)
    ? (r.risk_factors as unknown[]).map((f) => (typeof f === "string" ? f : JSON.stringify(f)))
    : [];
  return (
    <SectionCard
      title="Credit checks"
      description={`Run ${when(r.generated_at)}. The same policy engine as staff applications.`}
      action={
        <Pill tone={REC_TEXT[r.recommendation][1]}>Engine: {REC_TEXT[r.recommendation][0]}</Pill>
      }
    >
      <div className="space-y-4">
        {b && (
          <div>
            <h3 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bureau report
              {b.bureau_name.endsWith("SIMULATED") && <Pill tone="warning">Simulated (demo)</Pill>}
            </h3>
            {b.score === null ? (
              <p className="text-sm font-medium text-destructive">No record at the bureau.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-4">
                <LabelValue label="Score" value={<span className="tabular-nums">{b.score}</span>} />
                <LabelValue label="Active accounts" value={b.active_accounts ?? 0} />
                <LabelValue
                  label="Monthly obligation"
                  value={
                    <>
                      {money(b.total_monthly_emi)}
                      {b.bureau_count != null && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          EMIs plus 5% of card and overdraft balances
                        </span>
                      )}
                    </>
                  }
                />
                <LabelValue
                  label="Worst late payment (12 m)"
                  value={b.dpd_max_12m ? `${b.dpd_max_12m} days` : "None"}
                />
                <LabelValue label="Enquiries (90 days)" value={b.enquiry_count_90d ?? 0} />
                <LabelValue
                  label="Card use"
                  value={b.credit_utilization_pct !== null ? `${b.credit_utilization_pct}%` : "—"}
                />
                <LabelValue
                  label="Oldest account"
                  value={
                    b.oldest_account_months
                      ? `${Math.floor(b.oldest_account_months / 12)} y ${b.oldest_account_months % 12} m`
                      : "—"
                  }
                />
                <LabelValue
                  label="Write-offs / settled (5 y)"
                  value={`${b.writeoff_count_5y ?? 0} / ${b.settled_count_5y ?? 0}`}
                />
                <LabelValue
                  label="EMIs the customer declared"
                  value={money(checks.declared_existing_emis)}
                />
              </div>
            )}
          </div>
        )}
        {i && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Monthly income
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <LabelValue label="Declared" value={money(i.declared_net_salary)} />
              <LabelValue label="Salary slip" value={money(i.salary_slip_salary)} />
              <LabelValue label="Bank salary credits" value={money(i.bank_credit_salary)} />
              <LabelValue label="Form 16 (÷12)" value={money(i.form16_monthly_equiv)} />
            </div>
            <p
              className={cn(
                "mt-2 text-sm",
                i.income_variance_flag && "font-medium text-warning-foreground dark:text-warning",
              )}
            >
              Counted: {money(i.eligible_net_salary)} (the lowest of these)
              {i.income_variance_pct !== null
                ? ` · sources differ by up to ${i.income_variance_pct}%`
                : ""}
            </p>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Bank statement
          </h3>
          {k ? (
            <p className="text-sm">
              {k.months_covered} months · average balance {money(k.avg_monthly_balance)} · salary{" "}
              {k.salary_regularity === "REGULAR" ? "every month" : "not every month"} ·{" "}
              {k.bounce_count_6m ?? 0} bounces
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The reader could not analyse the statement, so the engine treats the bank checks as
              not available.
            </p>
          )}
        </div>
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-4">
          <LabelValue label="Rate" value={r.recommended_rate ? `${r.recommended_rate}%` : "—"} />
          <LabelValue label="EMI" value={money(r.recommended_emi)} />
          <LabelValue
            label="EMIs to income (FOIR)"
            value={r.foir_calculated !== null ? `${r.foir_calculated}%` : "—"}
          />
          <LabelValue
            label="Loan to value"
            value={r.ltv_calculated !== null ? `${r.ltv_calculated}%` : "—"}
          />
        </div>
        {(r.summary_text || factors.length > 0) && (
          <div className="text-sm">
            {r.summary_text && <p>{r.summary_text}</p>}
            {factors.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {factors.slice(0, 8).map((f, n) => (
                  <li key={n}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// After final approval: offer and KFS, the customer's steps, disbursement (sql/049)
// ---------------------------------------------------------------------------

function AfterApprovalPanel({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [a, setA] = useState<AfterApproval | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState("");

  const load = useCallback(async () => {
    try {
      setA(await getCaseLoan(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (tag: string, fn: () => Promise<unknown>) => {
    setBusy(tag);
    setError(null);
    try {
      await fn();
      await load();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!a)
    return (
      <section className="panel p-4 text-sm text-muted-foreground">
        {error ?? "Loading the loan…"}
      </section>
    );
  const o = a.offer;
  const papers = a.documents.filter((x) => x.doc_type !== "RC");
  const papersOk = papers.length > 0 && papers.every((x) => x.status === "ACCEPTED");
  const steps: [string, boolean, string][] = [
    [
      "Offer and KFS issued",
      !!o && o.status !== "WITHDRAWN",
      o ? `${o.sanction_ref}, open until ${o.valid_until}` : "Not issued",
    ],
    [
      "Customer accepted the KFS",
      o?.status === "ACCEPTED",
      o?.accepted_at
        ? new Date(o.accepted_at).toLocaleString("en-IN")
        : o?.expired
          ? "Offer expired"
          : "Waiting",
    ],
    [
      "Agreement e-signed",
      a.agreement?.status === "SIGNED",
      a.agreement?.signed_at
        ? `by ${a.agreement.signer_name}, ${new Date(a.agreement.signed_at).toLocaleString("en-IN")}`
        : "Waiting",
    ],
    [
      "EMI auto-debit set up",
      !!a.mandate,
      a.mandate ? `${a.mandate.bank_name} ${a.mandate.account}, ${a.mandate.umrn}` : "Waiting",
    ],
    [
      "Dealer papers accepted",
      papersOk,
      papers.length
        ? papers.map((x) => `${x.name}: ${x.status.toLowerCase()}`).join(" · ")
        : "Asked for once the offer is accepted",
    ],
    [
      "Paid to the dealer",
      !!a.loan,
      a.loan
        ? `${a.loan.loan_account_no}, ${inr(a.loan.net_paid, true)} to ${a.loan.paid_to}`
        : "—",
    ],
  ];
  const canIssue =
    !a.loan && (!o || o.status === "WITHDRAWN" || o.status === "EXPIRED" || o.expired);
  const canDisburse =
    !a.loan &&
    o?.status === "ACCEPTED" &&
    a.agreement?.status === "SIGNED" &&
    !!a.mandate &&
    papersOk;
  const docs = availableDocs(a);

  return (
    <section className="panel border-primary/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {a.loan
            ? `Disbursed · loan ${a.loan.loan_account_no}`
            : "After approval: offer, agreement, disbursement"}
        </h2>
        {o && (
          <span className="text-xs text-muted-foreground">
            {inr(o.sanctioned_amount)} · {o.rate_pct}% · APR {o.apr_pct}% · EMI {inr(o.emi)} ×{" "}
            {o.tenure_months}
          </span>
        )}
      </div>
      <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {steps.map(([label, done, note]) => (
          <li key={label} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                done ? "bg-success text-success-foreground" : "border border-border",
              )}
            >
              {done && <Check className="size-3" aria-hidden="true" />}
            </span>
            <span>
              <span className={cn(done ? "font-medium" : "text-muted-foreground")}>{label}</span>
              <span className="block text-xs text-muted-foreground">{note}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        {canIssue && (
          <Button disabled={busy !== null} onClick={() => void run("issue", () => issueOffer(id))}>
            {busy === "issue" && <Loader2 className="size-4 animate-spin" />}
            {o ? "Issue a fresh offer and KFS" : "Issue the offer and KFS"}
          </Button>
        )}
        {!a.loan && o?.status === "ACCEPTED" && (
          <>
            <div className="space-y-1">
              <label htmlFor="utr" className="text-xs text-muted-foreground">
                Payment reference (UTR), optional
              </label>
              <input
                id="utr"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase().slice(0, 30))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Simulated if left blank"
              />
            </div>
            <Button
              disabled={busy !== null || !canDisburse}
              onClick={() => void run("disburse", () => disburse(id, ref || undefined))}
            >
              {busy === "disburse" && <Loader2 className="size-4 animate-spin" />} Disburse to the
              dealer
            </Button>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {docs.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Loan documents
          </p>
          <div className="flex flex-wrap gap-2">
            {docs.map((doc) => (
              <Button
                key={doc.key}
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setBusy(doc.key);
                  void downloadPdf(doc.spec(), doc.file).finally(() => setBusy(null));
                }}
              >
                {busy === doc.key ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}{" "}
                {doc.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const CHECK_LOOK: Record<DocCheck["result"], { icon: typeof Check; cls: string; word: string }> = {
  PASS: { icon: Check, cls: "text-success", word: "passed" },
  FAIL: { icon: X, cls: "text-destructive", word: "failed" },
  UNREAD: {
    icon: TriangleAlert,
    cls: "text-warning-foreground dark:text-warning",
    word: "could not tell",
  },
  WAITING: { icon: CircleDashed, cls: "text-muted-foreground", word: "still reading" },
};

/** One line per check: tick, cross, warning or waiting, with the reason when it did not pass. */
function CheckList({ checks }: { checks: DocCheck[] }) {
  return (
    <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
      {checks.map((k) => {
        const look = CHECK_LOOK[k.result];
        return (
          <li key={k.check} className="flex items-start gap-1.5">
            <look.icon
              className={cn("mt-0.5 size-3.5 shrink-0", look.cls)}
              aria-label={look.word}
            />
            <span className={k.result === "PASS" ? "text-muted-foreground" : "text-foreground"}>
              {k.label}
              {k.detail && k.result !== "PASS" && (
                <span className="text-muted-foreground"> ({k.detail})</span>
              )}
              {!k.blocking && <span className="text-muted-foreground"> · for information</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** What the automatic checks did on this case, and what is left for a person. */
function AutoCheckSummary({
  checks,
  docs,
  open,
  busy,
  rerun,
}: {
  checks: DocumentChecks;
  docs: CaseDocument[];
  open: boolean;
  busy: string | null;
  rerun: () => void;
}) {
  const s = checks.summary;
  const name = (code: string) => docs.find((d) => d.doc_type === code)?.name ?? code;
  const forPerson = s?.for_a_person ?? [];
  const reading = s?.still_reading ?? [];
  const n = checks.auto_accepted.length;
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2.5 text-sm">
      <div className="space-y-0.5">
        {!s ? (
          <p className="text-muted-foreground">
            The automatic checks have not run on this case yet.
          </p>
        ) : (
          <>
            <p>
              <span className="font-medium">{n}</span> {n === 1 ? "document" : "documents"} accepted
              automatically.
              {s.docs_verified_automatically &&
                " Every needed document passed, so the case moved to the credit check by itself."}
            </p>
            {forPerson.length > 0 && (
              <p className="text-warning-foreground dark:text-warning">
                For you to check: {forPerson.map(name).join(", ")}.
              </p>
            )}
            {reading.length > 0 && (
              <p className="text-muted-foreground">
                Still being read: {reading.map(name).join(", ")}.
              </p>
            )}
            {s.credit_checks?.startsWith("NOT_RUN") && (
              <p className="text-muted-foreground">
                The credit check could not run by itself:{" "}
                {s.credit_checks.replace(/^NOT_RUN:\s*/, "")}.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Last run {when(s.at)}.</p>
          </>
        )}
      </div>
      {open && (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={rerun}>
          {busy === "AUTO" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Run the checks again
        </Button>
      )}
    </div>
  );
}
