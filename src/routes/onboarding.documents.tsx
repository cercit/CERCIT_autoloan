import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { useEffect, useState } from "react";

import { OnboardingShell } from "@/components/onboarding/shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { getCustomerState, type CustomerState } from "@/lib/customer-api";

export const Route = createFileRoute("/onboarding/documents")({
  validateSearch: (s: Record<string, unknown>): { app?: string } => (typeof s["app"] === "string" ? { app: s["app"] } : {}),
  head: () => ({ meta: [{ title: "Documents — cercit" }] }),
  component: DocumentsStep,
});

// Step 3. The checklist comes from the database (document map as data, sql/043).
// Uploading is the next build batch: it needs the upload service change in AWS.
function DocumentsStep() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<CustomerState | null>(null);

  useEffect(() => {
    void getCustomerState()
      .then((s) => (s.draft && (!app || s.draft.application_id === app) ? setState(s) : navigate({ to: "/login", search: { as: "customer" } })))
      .catch(() => navigate({ to: "/login", search: { as: "customer" } }));
  }, [app, navigate]);

  const docs = state?.draft?.documents ?? [];
  return (
    <OnboardingShell step={3} applicationId={app} title="Your documents" lead="Here is what we'll need. Uploading opens in the next update of this demo.">
      <ul className="panel divide-y divide-border">
        {docs.map((d) => (
          <li key={d.doc_type} className="flex items-start gap-3 p-4">
            {d.status === "MISSING" ? <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{d.name}</p>
              {d.note && <p className="mt-0.5 text-xs text-muted-foreground">{d.note}</p>}
            </div>
            <Pill tone={d.required === "ALWAYS" ? "info" : "muted"}>{d.required === "ALWAYS" ? "Needed" : "If applicable"}</Pill>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => navigate({ to: "/onboarding/car", search: app ? { app } : {} })}>
          <ArrowLeft className="size-4" /> Back to car details
        </Button>
      </div>
    </OnboardingShell>
  );
}
