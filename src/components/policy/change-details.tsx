/**
 * Before/after and history for a policy version (backlog CC4.2).
 */
import { useEffect, useState } from "react";

import { Pill } from "@/components/status";
import { getChangeDiff, getPolicyHistory, type ChangeLine, type HistoryEvent } from "@/lib/policy-api";

function withUnit(value: string | null, unit: string | null) {
  if (value === null) return "—";
  if (!unit) return value;
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

const changeTone = { CHANGED: "warning", ADDED: "success", REMOVED: "destructive" } as const;

export function ChangeDiff({ versionId }: { versionId: string }) {
  const [lines, setLines] = useState<ChangeLine[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getChangeDiff(versionId).then((l) => {
      if (!cancelled) setLines(l);
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  if (lines === null) return <p className="text-sm text-muted-foreground">Working out what changes…</p>;
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">No setting or rule differs from the version it was built from.</p>;

  const settings = lines.filter((l) => l.kind === "SETTING");
  const rules = lines.filter((l) => l.kind === "RULE");

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">Compared with {lines[0]?.comparedTo ?? "the version it was built from"}.</p>
      {settings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Setting</th>
                <th className="py-1 text-left font-medium">Before</th>
                <th className="py-1 text-left font-medium">After</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {settings.map((l) => (
                <tr key={l.item} className="border-t border-border">
                  <td className="py-1.5 pr-3">{l.label}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{withUnit(l.before, l.unit)}</td>
                  <td className="py-1.5 font-medium">{withUnit(l.after, l.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {rules.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rules.map((l, i) => (
            <li key={`${l.item}-${i}`} className="rounded-md border border-border p-2">
              <Pill tone={changeTone[l.change]}>{l.change === "CHANGED" ? "rule changed" : l.change === "ADDED" ? "rule added" : "rule removed"}</Pill>
              {l.before ? <p className="mt-1 font-mono text-xs text-muted-foreground line-through">{l.before}</p> : null}
              {l.after ? <p className="mt-1 font-mono text-xs">{l.after}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PolicyHistory({ versionId, limit }: { versionId?: string; limit?: number }) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPolicyHistory(versionId).then((e) => {
      if (!cancelled) setEvents(e);
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  if (events === null) return <p className="text-sm text-muted-foreground">Loading the history…</p>;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;

  const shown = limit ? events.slice(0, limit) : events;
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {shown.map((e, i) => (
        <li key={`${e.versionId}-${e.at}-${i}`} className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <span className="w-40 shrink-0 text-xs text-muted-foreground tabular">
            {new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="min-w-0 flex-1">
            {versionId ? null : <strong className="mr-2">{e.versionCode}</strong>}
            {e.event}
            {e.actor ? <span className="text-muted-foreground"> · {e.actor}</span> : null}
            {e.reconstructed ? <span className="ml-2"><Pill tone="muted">rebuilt from dates</Pill></span> : null}
            {e.note ? <span className="block whitespace-pre-line text-xs text-muted-foreground">{e.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
