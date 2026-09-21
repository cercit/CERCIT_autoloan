import { Link, createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EngineDecisionCard } from "@/components/policy/engine-decision-card";
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
import { getApplication, getBankingAnalysis, getBureauReport } from "@/lib/api";
import { BureauReportCard } from "@/components/bureau-report-card";
import { BureauUploadForm } from "@/components/bureau-upload-form";
import { MlRiskCard } from "@/components/ml-risk-card";
import { interpretScore, generateFlags } from "@/lib/bureau-score-interpreter";
import type { Application } from "@/lib/mock-data";
import { SlaTimer } from "@/components/sla-timer";
import { OverridePanel } from "@/components/override-panel";
import { EscalationDialog } from "@/components/escalation-dialog";
import { AuditTrailTimeline } from "@/components/audit-trail-timeline";
import { CAMPreview } from "@/components/cam-preview";
import { ApplicationTimeline } from "@/components/application-timeline";
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
import {
  isAwsConfigured,
  uploadDocument as awsUploadDocument,
  pollForExtraction,
  getExtractions,
  mapExtractionToFields,
  type DocType,
  type ExtractionResult,
} from "@/lib/aws-doc-api";

const AWS_DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "salary_slip", label: "Salary Slip" },
  { value: "form16", label: "Form 16" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "pan_card", label: "PAN Card" },
  { value: "aadhaar_card", label: "Aadhaar Card" },
  { value: "bureau_report", label: "Bureau Report" },
];

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

  const [bureauReport, setBureauReport] = useState<any>(null);
  const [bureauLoading, setBureauLoading] = useState(false);

  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Record<DocType, File>>({} as any);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [docRefreshKey, setDocRefreshKey] = useState(0);

  useEffect(() => {
    if (!app?.id || !isAwsConfigured()) return;
    getExtractions(app.id).then(setExtractionResult).catch(() => {});
  }, [app?.id]);

  async function handleAwsUpload(docType: DocType, file: File) {
    if (!app) return;
    setUploadingDoc(docType);
    try {
      await awsUploadDocument(app.id, docType, file);
      setUploadedFiles((prev) => ({ ...prev, [docType]: file }));
      toast.success(`${file.name} uploaded — extracting fields...`);
      setDocRefreshKey((k) => k + 1);
      const extracted = await pollForExtraction(app.id, docType);
      if (extracted) {
        const updated = await getExtractions(app.id);
        setExtractionResult(updated);
        toast.success(`Extraction complete for ${docType.replace("_", " ")}`);
      } else {
        toast.info("Extraction is still processing. Check the Extracted Data tab shortly.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploadingDoc(null);
    }
  }

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
    setBureauLoading(true);
    getBureauReport(app.id).then((report) => {
      setBureauReport(report);
      setBureauLoading(false);
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
          <TabsTrigger value="bureau">Bureau</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="cam">CAM Report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <EngineDecisionCard applicationId={app.id} />
          <CopilotReview app={app} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentList applicationId={app.id} refreshKey={docRefreshKey} />
          {isAwsConfigured() && (
            <div className="grid gap-4 sm:grid-cols-2">
              {AWS_DOC_TYPES.map((dt) => (
                <DocumentUploadZone
                  key={dt.value}
                  documentType={dt.label}
                  required={dt.value === "salary_slip"}
                  existingFile={uploadedFiles[dt.value]}
                  onFileSelect={(file) => handleAwsUpload(dt.value, file)}
                  onRemove={() => setUploadedFiles((prev) => {
                    const next = { ...prev };
                    delete next[dt.value];
                    return next;
                  })}
                />
              ))}
            </div>
          )}
          {uploadingDoc && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Uploading and extracting {uploadingDoc.replace(/_/g, " ")}...
            </div>
          )}
          <OfficerNotes applicationId={app.id} />
        </TabsContent>

        <TabsContent value="extracted" className="space-y-4">
          {extractionResult && Object.keys(extractionResult.extractions).length > 0 ? (
            Object.entries(extractionResult.extractions).map(([docType, fields]) => (
              <DocumentExtractionReview
                key={docType}
                documentName={`${app.name} — ${docType.replace(/_/g, " ")}`}
                documentType={docType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                fields={mapExtractionToFields(fields)}
                onConfirm={() => toast.success(`${docType.replace(/_/g, " ")} extraction confirmed`)}
              />
            ))
          ) : (
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
              onConfirm={() => toast.success("Extraction confirmed")}
            />
          )}
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

        <TabsContent value="bureau" className="space-y-4">
          {bureauLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : bureauReport ? (() => {
            const interp = interpretScore(bureauReport.score, "CIBIL");
            const flagData = generateFlags({
              score: bureauReport.score,
              enquiries90d: bureauReport.enquiries90Days,
              dpd30: bureauReport.dpdHistory?.filter((d: any) => d.months?.some((m: string) => m === "30+")).length ?? 0,
              dpd60: bureauReport.dpdHistory?.filter((d: any) => d.months?.some((m: string) => m === "60+")).length ?? 0,
              dpd90: bureauReport.dpdHistory?.filter((d: any) => d.months?.some((m: string) => m === "90+")).length ?? 0,
              activeAccounts: bureauReport.activeAccounts,
              totalCreditLimit: bureauReport.totalExposure,
              totalOutstanding: bureauReport.totalOutstanding,
            });
            const flagLabels: string[] = [];
            if (flagData.highEnquiryVelocity) flagLabels.push("High enquiry velocity");
            if (flagData.recentDPD) flagLabels.push("Recent DPD history");
            if (flagData.severeDelinquency) flagLabels.push("Severe delinquency (90+ DPD)");
            if (flagData.thinFile) flagLabels.push("Thin credit file");
            if (flagData.overLeveraged) flagLabels.push("Over-leveraged (>80% utilization)");
            const util = bureauReport.totalExposure > 0
              ? Math.round((bureauReport.totalOutstanding / bureauReport.totalExposure) * 100)
              : 0;
            return (
              <BureauReportCard
                bureauName="CIBIL"
                score={bureauReport.score}
                band={interp.band}
                dpd30={interp.dpd30}
                dpd60={interp.dpd60}
                dpd90={interp.dpd90}
                activeAccounts={bureauReport.activeAccounts}
                enquiries={bureauReport.enquiries90Days}
                utilizationPercent={util}
                flags={flagLabels}
                fetchedAt={new Date().toISOString()}
              />
            );
          })() : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">No bureau data available. Upload a CIBIL or Experian report below.</p>
              <BureauUploadForm
                applicationId={app.id}
                applicationPan={app.pan}
                onUploadComplete={() => {
                  setBureauLoading(true);
                  getBureauReport(app.id).then((report) => {
                    setBureauReport(report);
                    setBureauLoading(false);
                  });
                }}
              />
            </div>
          )}
          {!bureauLoading && (
            <MlRiskCard app={app} bureau={bureauReport} banking={bankingSummary} />
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
