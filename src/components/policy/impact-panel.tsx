/**
 * What a proposed change would do to recent applications (backlog CC3.2).
 *
 * Shown on each change waiting for approval, so the approver sees the effect
 * before signing. "Nothing changes" and "nothing could be checked" never look
 * alike: missing and unknown facts are listed next to the result.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { getImpact, runImpactCheck, type Decision, type ImpactCheck } from "@/lib/policy-api";

const decisionLabel: Record<Decision, string> = { approve: "Approve", review: "Review", decline: "Decline" };
const order: Decision[] = ["approve", "review", "decline"];

// Moving towards decline is the change an approver most needs to see.
function flipTone(key: string) {
  const [from, to] = key.split("->") as [Decision, Decision];
  return order.indexOf(to) > order.indexOf(from) ? ("destructive" as const) : ("success" as const);
}

function flipLabel(key: string) {
  const [from, to] = key.split("->") as [Decision, Decision];
  return `${decisionLabel[from] ?? from} → ${decisionLabel[to] ?? to}`;
}

function listed(entries: Record<string, number>) {
  return Object.entries(entries)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} (${n})`)
    .join(", ");
}

export function ImpactPanel({ versionId, liveVersionCode }: { versionId: string; liveVersionCode: string | null }) {
  const [impact, setImpact] = useState<ImpactCheck | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getImpact(versionId).then((i) => {
      if (cancelled) return;
      setImpact(i);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  async function run() {
    setRunning(true);
    const result = await runImpactCheck(versionId);
    if (!result.ok) {
      setRunning(false);
      toast.error(result.error);
      return;
    }
    setImpact(await getImpact(versionId));
    setRunning(false);
    toast.success("Impact check finished");
  }

  if (!loaded) return <p className="mt-3 text-sm text-muted-foreground">Loading the impact check…</p>;

  const runButton = (
    <Button size="sm" variant="secondary" disabled={running} onClick={run}>
      {running ? "Checking recent applications…" : impact ? "Run it again" : "Run the impact check"}
    </Button>
  );

  if (!impact) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
        <p className="text-sm text-muted-foreground">
          No impact check yet. It re-runs recent applications under this change and the version in force.
        </p>
        {runButton}
      </div>
    );
  }

  const flips = Object.entries(impact.flips).filter(([, n]) => n > 0);
  const outdated = impact.comparedTo && liveVersionCode && impact.comparedTo !== liveVersionCode;
  const unknown = listed(impact.factsNotKnown);
  const missing = listed(impact.skippedBecauseMissing);

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-subtle p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {impact.changed === 0
            ? `No decision changes across ${impact.evaluated} recent applications`
            : `${impact.changed} of ${impact.evaluated} recent applications would get a different decision`}
        </p>
        {runButton}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Compared with {impact.comparedTo ?? "the version in force"} ·{" "}
        {new Date(impact.runAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        {impact.runBy ? ` · run by ${impact.runBy}` : ""}
      </p>

      {outdated ? (
        <p className="mt-2 text-xs text-destructive">
          {impact.comparedTo} is no longer in force ({liveVersionCode} is). Run the check again before approving.
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium" />
              {order.map((d) => (
                <th key={d} className="py-1 text-right font-medium">{decisionLabel[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            <tr className="border-t border-border">
              <td className="py-1.5 text-muted-foreground">Under {impact.comparedTo ?? "the version in force"}</td>
              {order.map((d) => <td key={d} className="py-1.5 text-right">{impact.before[d]}</td>)}
            </tr>
            <tr className="border-t border-border">
              <td className="py-1.5 text-muted-foreground">Under this change</td>
              {order.map((d) => {
                const delta = impact.after[d] - impact.before[d];
                return (
                  <td key={d} className="py-1.5 text-right">
                    {impact.after[d]}
                    {delta !== 0 ? <span className="ml-1 text-xs text-muted-foreground">({delta > 0 ? "+" : ""}{delta})</span> : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {flips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {flips.map(([key, n]) => (
            <Pill key={key} tone={flipTone(key)}>{flipLabel(key)}: {n}</Pill>
          ))}
        </div>
      ) : null}

      {impact.skipped > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {impact.skipped} application{impact.skipped === 1 ? " was" : "s were"} left out because a required fact was missing{missing ? `: ${missing}` : ""}.
        </p>
      ) : null}
      {unknown ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Not known on some files, so the rules that read them could not fire: {unknown}. A change to those rules
          shows up here as "no change" even if it would matter.
        </p>
      ) : null}
    </div>
  );
}
