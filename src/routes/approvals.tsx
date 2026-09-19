import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { PendingChangeCard } from "@/components/policy/pending-change";
import { Button } from "@/components/ui/button";
import { useFeatureStatus } from "@/lib/feature-flags";
import { canApprovePolicy, getPendingChanges, getPolicyVersions, type PendingChange } from "@/lib/policy-api";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — cercit" },
      { name: "description", content: "Policy changes waiting for a second person's sign-off." },
    ],
  }),
  component: ApprovalsPage,
});

/**
 * Approval inbox (backlog CC4.1): every policy change waiting for sign-off, split
 * into the ones this person can approve and the ones they sent themselves.
 */
function ApprovalsPage() {
  const { enabled: creditControl, ready } = useFeatureStatus("credit_control");
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const [mayApprove, setMayApprove] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [ps, vs, can] = await Promise.all([getPendingChanges(), getPolicyVersions(), canApprovePolicy()]);
    setPending(ps);
    setLive(vs.find((v) => v.status === "ACTIVE")?.versionCode ?? null);
    setMayApprove(can);
    setLoaded(true);
  }

  useEffect(() => {
    if (ready && creditControl) void refresh();
  }, [ready, creditControl]);

  if (!ready || (creditControl && !loaded)) {
    return (
      <AppShell title="Approvals" subtitle="Loading">
        <SectionCard>Loading changes waiting for approval…</SectionCard>
      </AppShell>
    );
  }

  if (!creditControl) {
    return (
      <AppShell title="Approvals">
        <SectionCard>
          <p className="text-sm text-muted-foreground">
            Approvals start when Credit control is switched on. Until then, policy rules are changed directly on the
            Policy Rules screen.
          </p>
        </SectionCard>
      </AppShell>
    );
  }

  const forMe = pending.filter((c) => !c.mine);
  const mine = pending.filter((c) => c.mine);

  return (
    <AppShell
      title="Approvals"
      subtitle={
        forMe.length === 0
          ? "Nothing is waiting for you"
          : `${forMe.length} change${forMe.length === 1 ? "" : "s"} waiting for ${mayApprove ? "your approval" : "approval"}`
      }
      actions={
        <Button asChild variant="outline">
          <Link to="/policy-rules">Policy in force</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <SectionCard
          title={mayApprove ? "Waiting for you" : "Waiting for approval"}
          description="Written by someone else. Check what each would do to recent applications before signing it off."
        >
          {forMe.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to approve.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {forMe.map((c) => (
                <PendingChangeCard key={c.versionId} change={c} liveVersionCode={live} canApprove={mayApprove} onDone={refresh} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Sent by you" description="Someone else has to approve these. You can take one back to change it.">
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have nothing waiting.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.map((c) => (
                <PendingChangeCard key={c.versionId} change={c} liveVersionCode={live} onDone={refresh} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
