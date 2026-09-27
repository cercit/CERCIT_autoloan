import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileText, LogOut, ArrowLeft } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getCustomerEmail, isDemoMode, signOut, staffStatus } from "@/lib/auth";
import { DocumentRow } from "@/components/onboarding/document-upload";
import {
  getTracking,
  getUploadTypes,
  type DraftDocument,
  type TrackedApplication,
  type TrackingState,
  type UploadType,
} from "@/lib/customer-api";
import { inr } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand";

export const Route = createFileRoute("/application-status")({
  head: () => ({
    meta: [
      { title: "Application status -- cercit" },
      {
        name: "description",
        content: "Track your cercit car loan application status.",
      },
    ],
  }),
  component: ApplicationStatus,
});

interface ApplicationStage {
  label: string;
  date: string | null;
  done: boolean;
  active: boolean;
}

const DEMO_APPLICATION = {
  id: "CER-2026-04821",
  car: "Hyundai Creta SX(O)",
  loanAmount: 1200000,
  tenure: 60,
  status: "Under review",
  appliedOn: "10 Sep 2026",
  stages: [
    { label: "Application received", date: "10 Sep 2026, 4:35 PM", done: true, active: false },
    { label: "Documents checked", date: "10 Sep 2026, 5:12 PM", done: true, active: false },
    { label: "Credit assessment", date: null, done: false, active: true },
    { label: "Decision", date: null, done: false, active: false },
    { label: "Sanction letter", date: null, done: false, active: false },
  ] as ApplicationStage[],
};

// Stages the customer sees (sql/046 application_stage_events), in order.
const STAGES = [
  ["RECEIVED", "Application received"],
  ["DOCS_VERIFIED", "Documents checked"],
  ["CREDIT_CHECK", "Credit assessment"],
  ["DECISION", "Decision"],
  ["SANCTION", "Sanction letter"],
] as const;
// How far along each application status is: the index of the stage in progress.
const STATUS_AT: Record<string, number> = {
  SUBMITTED: 1,
  UNDER_ASSESSMENT: 2,
  APPROVED: 4,
  REJECTED: 4,
  SANCTIONED: 5,
  DISBURSED: 5,
};
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Received",
  UNDER_ASSESSMENT: "Under review",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  SANCTIONED: "Sanctioned",
  DISBURSED: "Disbursed",
  WITHDRAWN: "Withdrawn",
  CANCELLED: "Cancelled",
};
const STEP_ROUTES = {
  2: "/onboarding/car",
  3: "/onboarding/documents",
  4: "/onboarding/details",
} as const;

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

function stagesOf(a: TrackedApplication): ApplicationStage[] {
  const at = STATUS_AT[a.status] ?? 1;
  return STAGES.filter(([key]) => !(a.status === "REJECTED" && key === "SANCTION")).map(
    ([key, label], i) => ({
      label:
        key === "DECISION" && a.status === "REJECTED"
          ? "Decision: not approved"
          : key === "DECISION" && a.approval_stage === "IN_PRINCIPLE"
            ? "In-principle decision"
            : label,
      date: when(
        a.events.find((e) => e.stage === key)?.at ??
          (key === "RECEIVED" ? a.submitted_at : key === "DECISION" ? a.decided_at : null),
      ),
      done: i < at,
      active: i === at,
    }),
  );
}

function statusLabel(a: TrackedApplication) {
  if (a.status === "APPROVED" && a.approval_stage === "IN_PRINCIPLE")
    return "Approved in principle";
  return STATUS_LABEL[a.status] ?? "In progress";
}

function StageTimeline({ stages }: { stages: ApplicationStage[] }) {
  return (
    <ol className="space-y-0">
      {stages.map((stage, i) => (
        <li key={stage.label} className="relative flex gap-4 pb-6 last:pb-0">
          {i < stages.length - 1 && (
            <span
              className={cn(
                "absolute left-[15px] top-8 h-[calc(100%-16px)] w-0.5",
                stage.done ? "bg-primary" : "bg-border",
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2",
              stage.done
                ? "border-primary bg-primary text-primary-foreground"
                : stage.active
                  ? "border-primary bg-background"
                  : "border-border bg-background",
            )}
          >
            {stage.done ? (
              <CheckCircle2 className="size-4" />
            ) : stage.active ? (
              <Clock className="size-4 text-primary" />
            ) : (
              <span className="size-2 rounded-full bg-muted-foreground/30" />
            )}
          </span>
          <div className="pt-1">
            <p
              className={cn(
                "text-sm font-medium",
                stage.done
                  ? "text-foreground"
                  : stage.active
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {stage.label}
            </p>
            {stage.date && <p className="mt-0.5 text-xs text-muted-foreground">{stage.date}</p>}
            {stage.active && !stage.date && (
              <p className="mt-0.5 text-xs text-muted-foreground">In progress</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface View {
  id: string;
  status: string;
  car: string;
  loanAmount: number;
  tenure: number;
  stages: ApplicationStage[];
  appliedOn: string;
  attention: DraftDocument[];
  inPrinciple: boolean;
}

function toView(a: TrackedApplication): View {
  return {
    id: a.application_id,
    status: statusLabel(a),
    car: a.vehicle ?? "Car to be confirmed",
    loanAmount: a.loan_amount ?? 0,
    tenure: a.tenure_months ?? 0,
    stages: stagesOf(a),
    appliedOn: when(a.submitted_at) ?? "",
    attention: a.attention,
    inPrinciple: a.approval_stage === "IN_PRINCIPLE",
  };
}

function ApplicationStatus() {
  const navigate = useNavigate();
  const customerEmail = getCustomerEmail();
  const demo = isDemoMode();
  const [tracking, setTracking] = useState<TrackingState | null>(null);
  const [failed, setFailed] = useState(false);

  // This page is for customers. A staff login that lands here goes to its console.
  useEffect(() => {
    if (demo) return;
    void staffStatus().then((s) => {
      if (s === "staff") {
        try {
          sessionStorage.removeItem("cercit_customer_email");
        } catch {
          // storage blocked: nothing to clear
        }
        navigate({ to: "/dashboard" });
      }
    });
    if (isSupabaseConfigured)
      void getTracking()
        .then(setTracking)
        .catch(() => setFailed(true));
  }, [demo, navigate]);

  // Upload boxes for anything the officer asked for again, and the quotation.
  const [types, setTypes] = useState<Record<string, UploadType>>({});
  const waiting = (tracking?.applications ?? []).some((a) => a.attention.length > 0);
  useEffect(() => {
    if (waiting)
      void getUploadTypes()
        .then(setTypes)
        .catch(() => setTypes({}));
  }, [waiting]);
  const reload = async () => {
    setTracking(await getTracking());
  };

  const handleSignOut = async () => {
    await signOut();
    try {
      sessionStorage.removeItem("cercit_demo");
      sessionStorage.removeItem("cercit_customer_email");
    } catch {
      // storage blocked: nothing to clear
    }
    navigate({ to: "/login" });
  };

  const views: View[] = demo
    ? [{ ...DEMO_APPLICATION, attention: [], inPrinciple: false }]
    : (tracking?.applications ?? []).map(toView);
  const email = tracking?.customer?.email ?? customerEmail;
  const draft = demo ? null : tracking?.draft;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <BrandLogo height={30} />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your application</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {email ? `Signed in as ${email}` : "Track your loan application status"}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" /> Home
            </Link>
          </Button>
        </div>

        {demo && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Demo mode -- showing a sample application. A signed-in customer sees their own
            applications here.
          </div>
        )}

        {draft && (
          <div className="panel mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold">You have an application in progress</p>
              <p className="text-xs text-muted-foreground">
                {draft.application_id}, step {Math.max(2, draft.step)} of 4
              </p>
            </div>
            <Button size="sm" asChild>
              <Link
                to={STEP_ROUTES[Math.min(4, Math.max(2, draft.step)) as 2 | 3 | 4]}
                search={{ app: draft.application_id }}
              >
                Continue
              </Link>
            </Button>
          </div>
        )}

        {!demo && tracking && views.length === 0 && !draft && (
          <div className="panel mt-6 p-6 text-sm">
            <p className="font-medium">No applications yet.</p>
            <Link
              to="/login"
              search={{ as: "customer" }}
              className="mt-2 inline-block text-primary underline underline-offset-2"
            >
              Start a car loan application
            </Link>
          </div>
        )}
        {!demo && failed && (
          <p className="mt-6 text-sm text-destructive">
            We couldn't load your applications. Refresh the page to try again.
          </p>
        )}
        {!demo && !tracking && !failed && isSupabaseConfigured && (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        )}

        {views.map((view) => (
          <div key={view.id} className="panel mt-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Application ID</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight">{view.id}</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  view.status.startsWith("Approved") ||
                    view.status === "Sanctioned" ||
                    view.status === "Disbursed"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : view.status === "Not approved"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                )}
              >
                <Clock className="size-3" />
                {view.status}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface-subtle p-4">
                <p className="text-xs text-muted-foreground">Vehicle</p>
                <p className="mt-0.5 text-sm font-medium">{view.car}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-subtle p-4">
                <p className="text-xs text-muted-foreground">Loan amount</p>
                <p className="mt-0.5 text-sm font-medium">
                  {view.loanAmount ? inr(view.loanAmount) : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-subtle p-4">
                <p className="text-xs text-muted-foreground">Tenure</p>
                <p className="mt-0.5 text-sm font-medium">
                  {view.tenure ? `${view.tenure} months` : "—"}
                </p>
              </div>
            </div>

            {view.inPrinciple && (
              <p className="mt-4 text-sm text-muted-foreground">
                You applied without the dealer's quotation, so this is for in-principle approval.
                Upload the quotation when you have it to move to final approval.
              </p>
            )}
            {view.attention.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium">We need from you</p>
                <ul className="space-y-3">
                  {view.attention.map((d) => (
                    <DocumentRow
                      key={d.doc_type}
                      app={view.id}
                      doc={d}
                      type={types[d.doc_type]}
                      locked={false}
                      onDone={reload}
                    />
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 border-t border-border pt-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4" /> Progress
              </h2>
              <div className="mt-4">
                <StageTimeline stages={view.stages} />
              </div>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Applied on {view.appliedOn}. Questions? Email support@cercit.in
            </p>
          </div>
        ))}

        <div className="panel mt-4 p-5 sm:p-6">
          <h2 className="text-sm font-semibold">What happens next?</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Our credit team checks your documents against what you told us.</li>
            <li>With your consent, we pull your credit bureau report.</li>
            <li>The policy engine runs its checks and a credit officer makes the decision.</li>
            <li>We email you at each step. You can come back to this page any time.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
