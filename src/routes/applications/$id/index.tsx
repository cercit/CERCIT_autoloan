import { Link, createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CopilotReview } from "@/components/copilot-review";
import { Button } from "@/components/ui/button";
import { applications, getApplication } from "@/lib/mock-data";

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
  const app = getApplication(id) ?? applications[0];

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
      <CopilotReview app={app} />
    </AppShell>
  );
}
