/**
 * One policy change waiting for approval: what it is, what it would do, and the
 * actions open to the person looking at it. Used on the Policy Rules screen and
 * in the Approvals inbox (backlog CC4.1).
 */
import { useState } from "react";
import { toast } from "sonner";

import { ChangeDiff, PolicyHistory } from "@/components/policy/change-details";
import { ImpactPanel } from "@/components/policy/impact-panel";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { approveChange, rejectChange, withdrawChange, type PendingChange } from "@/lib/policy-api";

export function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function PendingChangeCard({
  change,
  liveVersionCode,
  canApprove = true,
  onDone,
}: {
  change: PendingChange;
  liveVersionCode: string | null;
  /** False for someone who may read the queue but not sign changes off. */
  canApprove?: boolean;
  onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject" | "withdraw") {
    let result;
    if (action === "approve") {
      const date = window.prompt("Start date (YYYY-MM-DD)", new Date(Date.now() + 864e5).toISOString().slice(0, 10));
      if (!date) return;
      setBusy(true);
      result = await approveChange(change.versionId, `${date}T00:00:00+05:30`, window.prompt("Comment (optional)") ?? undefined);
    } else if (action === "reject") {
      const reason = window.prompt("Why is it being rejected?");
      if (!reason) return;
      setBusy(true);
      result = await rejectChange(change.versionId, reason);
    } else {
      const reason = window.prompt("Why take it back? (optional)");
      setBusy(true);
      result = await withdrawChange(change.versionId, reason ?? undefined);
    }
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      action === "approve" ? "Approved. It goes live on its start date." :
      action === "reject" ? "Rejected" : "Taken back to your drafts"
    );
    await onDone();
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{change.versionCode}</strong>
        <Pill tone="warning">waiting</Pill>
        {change.tier ? <Pill tone="muted">{change.tier.toLowerCase()}</Pill> : null}
        <span className="text-sm text-muted-foreground">
          {change.author ? `by ${change.author}` : "author unknown"} · sent {when(change.submittedAt)}
        </span>
      </div>
      <p className="mt-1 text-sm">{change.title ?? change.rationale}</p>
      {change.summary ? <p className="mt-1 text-sm text-muted-foreground">{change.summary}</p> : null}
      <details className="mt-3 rounded-lg border border-border p-3" open>
        <summary className="cursor-pointer text-sm font-medium">What changes</summary>
        <div className="mt-2">
          <ChangeDiff versionId={change.versionId} />
        </div>
      </details>
      <ImpactPanel versionId={change.versionId} liveVersionCode={liveVersionCode} />
      <details className="mt-3 rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">History of this change</summary>
        <div className="mt-2">
          <PolicyHistory versionId={change.versionId} />
        </div>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {change.mine ? (
          <>
            <span className="text-sm text-muted-foreground">
              You wrote this one, so someone else has to approve it.
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("withdraw")}>
              Take it back
            </Button>
          </>
        ) : canApprove ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => act("approve")}>Approve</Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => act("reject")}>
              Reject
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Your role can see this change but not approve it.</span>
        )}
      </div>
    </li>
  );
}
