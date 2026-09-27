import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AppShell, LabelValue, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { inr } from "@/lib/format";
import {
  FACE_TEXT,
  STATUS_TEXT,
  caseAction,
  fileLink,
  getCustomerCase,
  type CaseAction,
  type CaseDocument,
  type CustomerCase,
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
  if (key === "net_monthly_salary") return inr(Number(v));
  const text = String(v);
  // Stored codes (FEMALE, PRIVATE_LTD) read as words: "Female", "Private ltd".
  if (/^[A-Z][A-Z_]+$/.test(text)) return text.charAt(0) + text.slice(1).toLowerCase().replaceAll("_", " ");
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

  const load = useCallback(async () => {
    try {
      setC(await getCustomerCase(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

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

      <NextStep c={c} notAccepted={notAccepted} quoteIn={quoteIn} busy={busy} act={act} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            title="Documents"
            description="Open each file, then accept it or ask the customer again. The customer sees your reason."
          >
            <ul className="divide-y divide-border">
              {c.documents.map((d) => (
                <DocumentLine
                  key={d.doc_type}
                  app={a.application_id}
                  d={d}
                  open={open}
                  busy={busy}
                  act={act}
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
  notAccepted,
  quoteIn,
  busy,
  act,
}: {
  c: CustomerCase;
  notAccepted: CaseDocument[];
  quoteIn: boolean;
  busy: string | null;
  act: Act;
}) {
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
              disabled={busy !== null || (a.status === "UNDER_REVIEW" && d === "REFER")}
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
}: {
  app: string;
  d: CaseDocument;
  open: boolean;
  busy: string | null;
  act: Act;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [label, tone] = DOC_STATUS[d.status];

  async function view(key: string) {
    setLinkError(null);
    const w = window.open("", "_blank", "noopener");
    try {
      const url = await fileLink(app, key);
      if (w) w.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (e) {
      w?.close();
      setLinkError((e as Error).message);
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
