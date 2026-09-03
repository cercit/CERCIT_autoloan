import { Link, createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { CopilotReview } from "@/components/copilot-review";
import { DocumentList } from "@/components/document-list";
import { BankStatementSummary } from "@/components/bank-statement-summary";
import { BankStatementTransactions } from "@/components/bank-statement-transactions";
import { DocumentUpload } from "@/components/document-upload";
import { OfficerNotes } from "@/components/officer-notes";
import { ExtractionResult } from "@/components/extraction-result";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApplication, getBankingAnalysis } from "@/lib/api";
import type { Application } from "@/lib/mock-data";

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
        <Button variant="outline" asChild>
          <Link to="/applications/$id/manager-review" params={{ id: app.id }}>
            <UserCog className="size-4" /> Manager view
          </Link>
        </Button>
      }
    >
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <CopilotReview app={app} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentList applicationId={app.id} />
          <DocumentUpload applicationId={app.id} />
          <OfficerNotes applicationId={app.id} />
        </TabsContent>

        <TabsContent value="extracted">
          <ExtractionResult />
        </TabsContent>

        <TabsContent value="banking" className="space-y-4">
          {bankingLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : bankingSummary ? (
            <>
              <BankStatementSummary data={bankingSummary} />
              <BankStatementTransactions transactions={bankingTxns} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No banking data available.</p>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
