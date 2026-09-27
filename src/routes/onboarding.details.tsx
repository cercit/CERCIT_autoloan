import { createFileRoute } from "@tanstack/react-router";

import { OnboardingShell } from "@/components/onboarding/shell";

export const Route = createFileRoute("/onboarding/details")({
  validateSearch: (s: Record<string, unknown>): { app?: string } => (typeof s["app"] === "string" ? { app: s["app"] } : {}),
  head: () => ({ meta: [{ title: "Address and details — cercit" }] }),
  component: DetailsStep,
});

// Step 4 (address and personal details) — next build batch.
function DetailsStep() {
  const { app } = Route.useSearch();
  return (
    <OnboardingShell step={4} applicationId={app} title="Address and personal details" lead="This step opens in the next update of this demo.">
      <p className="panel p-6 text-sm text-muted-foreground">Coming next: current and permanent address, date of birth, and your employer.</p>
    </OnboardingShell>
  );
}
