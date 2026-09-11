import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  ArrowLeft,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getCustomerEmail, isDemoMode, signOut } from "@/lib/auth";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  name: "Sameer Mittimani",
  email: "sameer@gmail.com",
  car: "Hyundai Creta SX(O)",
  loanAmount: 1200000,
  tenure: 60,
  rate: 8.99,
  emi: 24904,
  status: "Under review",
  appliedOn: "10 Sep 2026",
  stages: [
    { label: "Application received", date: "10 Sep 2026, 4:35 PM", done: true, active: false },
    { label: "Documents verified", date: "10 Sep 2026, 5:12 PM", done: true, active: false },
    { label: "Credit assessment", date: null, done: false, active: true },
    { label: "Decision", date: null, done: false, active: false },
    { label: "Sanction letter", date: null, done: false, active: false },
  ] as ApplicationStage[],
};

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
            {stage.date && (
              <p className="mt-0.5 text-xs text-muted-foreground">{stage.date}</p>
            )}
            {stage.active && !stage.date && (
              <p className="mt-0.5 text-xs text-muted-foreground">In progress</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ApplicationStatus() {
  const navigate = useNavigate();
  const customerEmail = getCustomerEmail();
  const demo = isDemoMode();
  const app = DEMO_APPLICATION;

  const handleSignOut = async () => {
    await signOut();
    try {
      sessionStorage.removeItem("cercit_demo");
      sessionStorage.removeItem("cercit_customer_email");
    } catch {}
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              c
            </span>
            <span className="text-lg font-bold tracking-tight">cercit</span>
          </Link>
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
              {customerEmail
                ? `Signed in as ${customerEmail}`
                : "Track your loan application status"}
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
            Demo mode -- showing a sample application. In production, this page
            pulls your real application data from Supabase.
          </div>
        )}

        <div className="panel mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Application ID</p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight">{app.id}</p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                app.status === "Approved"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : app.status === "Rejected"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
              )}
            >
              <Clock className="size-3" />
              {app.status}
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-subtle p-4">
              <p className="text-xs text-muted-foreground">Vehicle</p>
              <p className="mt-0.5 text-sm font-medium">{app.car}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle p-4">
              <p className="text-xs text-muted-foreground">Loan amount</p>
              <p className="mt-0.5 text-sm font-medium">{inr(app.loanAmount)}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle p-4">
              <p className="text-xs text-muted-foreground">Tenure</p>
              <p className="mt-0.5 text-sm font-medium">{app.tenure} months ({app.tenure / 12} years)</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle p-4">
              <p className="text-xs text-muted-foreground">Estimated EMI</p>
              <p className="mt-0.5 text-sm font-medium text-primary">{inr(app.emi)}/month</p>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4" /> Progress
            </h2>
            <div className="mt-4">
              <StageTimeline stages={app.stages} />
            </div>
          </div>
        </div>

        <div className="panel mt-4 p-5 sm:p-6">
          <h2 className="text-sm font-semibold">What happens next?</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Your documents are being verified by our credit team.</li>
            <li>The policy engine runs 16 automated checks on your application.</li>
            <li>A credit officer reviews the assessment and makes a decision.</li>
            <li>You will receive an SMS and email with the outcome within 2 hours.</li>
          </ul>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Applied on {app.appliedOn} -- Questions? Email support@cercit.in
        </p>
      </main>
    </div>
  );
}
