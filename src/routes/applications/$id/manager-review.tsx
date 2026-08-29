import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CopilotReview } from "@/components/copilot-review";
import { Button } from "@/components/ui/button";
import { applications, getApplication } from "@/lib/mock-data";

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
  const app = getApplication(id) ?? applications[2];
  const withReferral = app.referredBy
    ? app
    : {
        ...app,
        referredBy: "Rajeev Menon",
        referralNote:
          "Borderline file — requesting manager decision within delegated authority.",
      };

  return (
    <AppShell
      title="Credit Manager Review"
      subtitle="Referred file — manager decision required"
      actions={
        <Button variant="outline" asChild>
          <Link to="/applications/$id" params={{ id: app.id }}>
            <ArrowLeft className="size-4" /> Officer view
          </Link>
        </Button>
      }
    >
      <CopilotReview app={withReferral} manager />
    </AppShell>
  );
}
