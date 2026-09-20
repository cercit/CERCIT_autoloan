/**
 * What the rules engine said about this case (backlog FD4.5).
 *
 * While the server_engine switch is off, the engine's answer is recorded but
 * not used — so the card shows both answers side by side and says plainly when
 * they disagree. With the switch on, the engine's answer is the decision.
 */
import { useEffect, useState } from "react";

import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { getEngineDecision, type EngineDecision } from "@/lib/engine-api";

const label = { approve: "Approve", review: "Review", decline: "Decline" } as const;
const tone = { approve: "success", review: "warning", decline: "destructive" } as const;
// What the case calls the same three answers
const asBand = { approve: "APPROVE", review: "MAYBE", decline: "REJECT" } as const;

export function EngineDecisionCard({ applicationId }: { applicationId: string }) {
  const [engine, setEngine] = useState<EngineDecision | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEngineDecision(applicationId).then((e) => {
      if (!cancelled) setEngine(e);
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (!engine) return null;

  const stored = engine.storedDecision;
  const agrees = !stored || stored === asBand[engine.decision];

  return (
    <SectionCard
      title="What the rules engine says"
      description={
        engine.applied
          ? `This case was decided by policy version ${engine.versionCode ?? "—"}.`
          : `Recorded for comparison on policy version ${engine.versionCode ?? "—"}. The decision on file was made by the current engine.`
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={tone[engine.decision]}>{label[engine.decision]}</Pill>
        {engine.applied ? <Pill tone="muted">used as the decision</Pill> : <Pill tone="muted">not used yet</Pill>}
        {!agrees ? <Pill tone="warning">differs from the decision on file ({stored})</Pill> : null}
        <span className="text-sm text-muted-foreground">
          {new Date(engine.decidedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {engine.score === null ? "" : ` · score ${engine.score}`}
        </span>
      </div>

      {engine.hardFailed.length > 0 ? (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Rules failed outright: </span>
          <span className="font-mono text-xs">{engine.hardFailed.join(", ")}</span>
        </p>
      ) : null}
      {engine.softFailed.length > 0 ? (
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Flagged for review: </span>
          <span className="font-mono text-xs">{engine.softFailed.join(", ")}</span>
        </p>
      ) : null}
      {engine.hardFailed.length === 0 && engine.softFailed.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Every rule passed.</p>
      ) : null}
      {engine.factsNotKnown.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Not known on this file, so the rules reading them never fired:{" "}
          <span className="font-mono">{engine.factsNotKnown.join(", ")}</span>.
        </p>
      ) : null}
    </SectionCard>
  );
}
