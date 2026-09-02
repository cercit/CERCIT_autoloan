import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { CopilotReview } from "@/components/copilot-review";
import { ManagerDecisionPanel } from "@/components/manager-decision-panel";
import { Button } from "@/components/ui/button";
import { getApplication } from "@/lib/api";
import type { Application } from "@/lib/mock-data";

export const Route = createFileRoute("/applications/$id/manager-review")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — Credit Manager Review | cercit` },
      {
        name: "description",
        content:
          "Credit manager review with referral notes, override history and delegated approval authority for a referred car loan application.",
      },
      { property: "og:title", content: `${params.id} — Credit Manager Review | cercit` },
      {
        property: "og:description",
        content: "Referral notes, override history and delegated approval authority.",
      },
    ],
  }),
  component: ManagerReview,
});

function ManagerReview() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<Application | null>(null);

  useEffect(() => {
    getApplication(id).then((result) => setApp(result ?? null));
  }, [id]);

  if (!app) {
    return (
      <AppShell title="Credit Manager Review" subtitle="Loading...">
        <div className="py-20 text-center text-muted-foreground">Loading application...</div>
      </AppShell>
    );
  }

  // No fake referral data injection — use real referral info or show direct review
  return (
    <AppShell
      title="Credit Manager Review"
      subtitle={app.referredBy ? `Referred file — manager decision required` : "Direct review — no referral"}
      actions={
        <Button variant="outline" asChild>
          <Link to="/applications/$id" params={{ id: app.id }}>
            <ArrowLeft className="size-4" /> Officer view
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <CopilotReview app={app} manager />
        <ManagerDecisionPanel app={app} />
      </div>
    </AppShell>
  );
}
