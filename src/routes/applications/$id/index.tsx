import { Link, createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { CopilotReview } from "@/components/copilot-review";
import { DocumentList } from "@/components/document-list";
import { CashflowSummaryCard } from "@/components/cashflow-summary-card";
import { TransactionTable } from "@/components/transaction-table";
import { DocumentUploadZone } from "@/components/document-upload-zone";
import { OfficerNotes } from "@/components/officer-notes";
import { DocumentExtractionReview } from "@/components/document-extraction-review";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApplication, getBankingAnalysis } from "@/lib/api";
import type { Application } from "@/lib/mock-data";
import { SlaTimer } from "@/components/sla-timer";
import { OverridePanel } from "@/components/override-panel";
import { EscalationDialog } from "@/components/escalation-dialog";
import { AuditTrailTimeline } from "@/components/audit-trail-timeline";
import { CAMPreview } from "@/components/cam-preview";
import { runAssessment } from "@/lib/engine";
import { getAvailableTransitions } from "@/lib/workflow";
import type { ApplicationStatus } from "@/lib/workflow";
import { transitionStatus, checkDuplicates, getApplicationTimeline, assignApplication } from "@/lib/api";
import type { TimelineEvent, DuplicateMatch } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/applications/$id/")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — Application Review | cercit` },
      {
        name: "description",
        content:
          "AI-assisted credit review with income assessment, bureau summary, FOIR, LTV, policy checks and decisioning for a car loan application.",
      },
      { property: "og:title", content: `${params.id} — Application Review | cercit` },
      {
        property: "og:description",
        content: "AI-assisted credit review with policy checks, FOIR, LTV and decisioning.",
      },
    ],
  }),
  component: ApplicationDetail,
});

function ApplicationDetail() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<Application | null>(null);
  const [bankingSummary, setBankingSummary] = useState<any>(null);
  const [bankingTxns, setBankingTxns] = useState<any[]>([]);
  const [bankingLoading, setBankingLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    getApplication(id).then((result) => setApp(result ?? null));
  }, [id]);

  useEffect(() => {
    if (!app?.id) return;
    setBankingLoading(true);
    getBankingAnalysis(app.id).then((res: { summary: any; transactions: any[] }) => {
      setBankingSummary(res.summary);
      setBankingTxns(res.transactions);
      setBankingLoading(false);
    });
  }, [app?.id]);

  useEffect(() => {
    if (!app?.id) return;
    checkDuplicates(app.pan, app.phone, app.id).then(setDuplicates);
    getApplicationTimeline(app.id).then(setTimeline);
  }, [app?.id, app?.pan, app?.phone]);

  if (!app) {
    return (
      <AppShell title="Application Review" subtitle="Loading application...">
        <div className="space-y-4">
          <div className="flex gap-4">
            <Skeleton className="h-24 w-64 rounded-xl" />
            <Skeleton className="h-24 w-48 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-full max-w-md" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Application Review"
      subtitle="Credit copilot — AI assessment with full underwriting evidence"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SlaTimer since={app.submitted} />
          {getAvailableTransitions(app.status as ApplicationStatus).map((next) => (
            <Button
              key={next}
              variant="outline"
              size="sm"
              onClick={async () => {
                const { error } = await transitionStatus(app.id, next);
                if (error) { toast.error(error); } else { toast.success(`Status changed to ${next}`); }
              }}
            >
              {next}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            Assign
          </Button>
          <OverridePanel
            applicationId={app.id}
            currentDecision={app.recommendation}
            onOverride={() => getApplication(id).then((r) => setApp(r ?? null))}
          />
          <EscalationDialog
            applicationId={app.id}
            onEscalate={() => getApplication(id).then((r) => setApp(r ?? null))}
          />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print CAM
          </Button>
          <Button variant="outline" asChild>
            <Link to="/applications/$id/manager-review" params={{ id: app.id }}>
              <UserCog className="size-4" /> Manager view
            </Link>
          </Button>
        </div>
      }
    >
      {duplicates.length > 0 && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-semibold">Possible duplicate applications found</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {duplicates.map((d) => (
              <li key={d.applicationId}>
                {d.applicationId} — matched on {d.matchField} · {d.name} · {d.status}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="cam">CAM Report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <CopilotReview app={app} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentList applicationId={app.id} />
          <DocumentUploadZone documentType="Application Document" onFileSelect={() => {}} />
          <OfficerNotes applicationId={app.id} />
        </TabsContent>

        <TabsContent value="extracted">
          <DocumentExtractionReview
            documentName={`${app.name} — Application`}
            documentType="KYC + Income"
            fields={[
              { label: "Full Name", value: app.name, confidence: "high" },
              { label: "PAN", value: app.pan, confidence: "high" },
              { label: "Employer", value: app.employer, confidence: "high" },
              { label: "Net Income", value: String(app.netIncome), confidence: "medium" },
              { label: "City", value: app.city, confidence: "high" },
            ]}
          />
        </TabsContent>

        <TabsContent value="banking" className="space-y-4">
          {bankingLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : bankingSummary ? (
            <>
              <CashflowSummaryCard
                totalCredits={bankingSummary.avgSalaryAmount * bankingSummary.months}
                totalDebits={bankingSummary.emiDebitTotal + bankingSummary.cashDeposits}
                avgMonthlyBalance={bankingSummary.avgMonthlyBalance}
                avgSalary={bankingSummary.avgSalaryAmount}
                salaryRegularity={Math.round((bankingSummary.salaryCreditCount / bankingSummary.months) * 100)}
                bounceCount={bankingSummary.chequeBounceOutward}
                totalEmiBurden={bankingSummary.emiDebitTotal}
                cashWithdrawalRatio={bankingSummary.avgMonthlyBalance > 0 ? Math.round((bankingSummary.cashDeposits / bankingSummary.avgMonthlyBalance) * 100) : 0}
                monthCount={bankingSummary.months}
              />
              <TransactionTable transactions={bankingTxns} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No banking data available.</p>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <AuditTrailTimeline
            entries={timeline.map((e, i) => ({
              id: String(i),
              application_id: app.id,
              actor: e.actor,
              action: e.stage,
              detail: e.detail ? { note: e.detail } : {},
              timestamp: e.timestamp,
            }))}
          />
        </TabsContent>

        <TabsContent value="cam">
          {(() => {
            const result = runAssessment(app);
            return (
              <CAMPreview data={{
                applicationId: app.id,
                applicantName: app.name,
                applicantAge: app.age,
                pan: app.pan,
                vehicleMake: app.vehicle.split(" ")[0] ?? "",
                vehicleModel: app.vehicle,
                vehicleSegment: app.category,
                exShowroom: app.exShowroom,
                onRoad: app.onRoad,
                loanAmount: app.loanAmount,
                tenureMonths: app.tenure || 60,
                ratePercent: result.decision.suggestedRate,
                emi: result.income.proposedEmi,
                bureauScore: result.bureau.score,
                bureauName: "CIBIL",
                foirPercent: result.income.foir,
                ltvPercent: result.ltv.ltvExShowroom,
                policyDecision: result.decision.decision === "APPROVE" ? "approve" : result.decision.decision === "REJECT" ? "decline" : "review",
                policyFailedRules: result.policy.violations.map(v => v.rule),
                recommendation: result.decision.reasons.join("; "),
                generatedAt: result.timestamp,
              }} />
            );
          })()}
        </TabsContent>
      </Tabs>
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign application</DialogTitle>
            <DialogDescription>Select an officer to assign this application to.</DialogDescription>
          </DialogHeader>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Select officer" />
            </SelectTrigger>
            <SelectContent>
              {["Rajeev Menon", "Priya Sharma", "Ankit Patel"].map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              const { error } = await assignApplication(app.id, assignee);
              if (error) { toast.error(error); } else { toast.success(`Assigned to ${assignee}`); setAssignOpen(false); }
            }}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
