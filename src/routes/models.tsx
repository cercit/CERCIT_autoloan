import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getModelComparison,
  getModelControls,
  getModelInventory,
  setModelScoresShown,
  type ModelComparisonRow,
  type ModelControls,
  type ModelInventoryRow,
} from "@/lib/models-api";
import { can, useMyRights } from "@/lib/permissions";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Risk models — cercit" },
      {
        name: "description",
        content:
          "Every risk model, how it was tested, how it scores live cases, and the switch to turn the score off.",
      },
    ],
  }),
  component: ModelsPage,
});

const pct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
const day = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const STATUS_TEXT: Record<ModelInventoryRow["status"], string> = {
  ACTIVE: "Live: officers see its score",
  SHADOW: "Shadow: scored and saved, not shown",
  RETIRED: "Retired: kept because older decisions name it",
};

function ModelsPage() {
  const rights = useMyRights();
  const canSwitch = can(rights, "model.approve");
  const [inventory, setInventory] = useState<ModelInventoryRow[] | null>(null);
  const [controls, setControls] = useState<ModelControls | null>(null);
  const [months, setMonths] = useState(12);
  const [comparison, setComparison] = useState<ModelComparisonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getModelInventory()
      .then(setInventory)
      .catch((e: Error) => setError(e.message));
    void getModelControls().then(setControls);
  }, []);
  useEffect(() => {
    setComparison(null);
    getModelComparison(months)
      .then(setComparison)
      .catch((e: Error) => setError(e.message));
  }, [months]);

  async function flip() {
    if (!controls) return;
    setSaving(true);
    try {
      const next = await setModelScoresShown(!controls.scoresShown, reason);
      setControls(next);
      setReason("");
      toast.success(
        next.scoresShown
          ? "Risk score switched back on"
          : "Risk score switched off for every officer",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Risk models"
      subtitle="Inventory, live comparison and the off switch (model risk, R9)"
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <SectionCard
          title="Risk score on the case screen"
          description="The score only advises: policy rules decide and an officer signs off. The Admin can switch it off at once, for example if it starts drifting."
        >
          {controls ? (
            <div className="space-y-3">
              <p className="text-sm">
                <Pill tone={controls.scoresShown ? "success" : "warning"}>
                  {controls.scoresShown ? "Shown to officers" : "Switched off"}
                </Pill>
                {controls.reason && (
                  <span className="ml-2 text-muted-foreground">
                    Last change: {controls.reason} ({day(controls.changedAt)})
                  </span>
                )}
              </p>
              {canSwitch ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Textarea
                    id="model-switch-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (kept in the audit log)"
                    className="min-h-[38px] sm:max-w-md"
                  />
                  <Button
                    onClick={flip}
                    disabled={saving || reason.trim().length < 5}
                    variant={controls.scoresShown ? "destructive" : "default"}
                  >
                    {controls.scoresShown ? "Switch the score off" : "Switch the score on"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Only the Admin can switch it.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </SectionCard>

        <SectionCard
          title="Model inventory"
          description="Every model the system has used or is testing, how it was trained and tested, and who checked it."
        >
          {!inventory ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : inventory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No models recorded yet (sample mode shows none).
            </p>
          ) : (
            <div className="space-y-3">
              {inventory.map((m) => (
                <div key={m.modelVersion} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.modelVersion}</span>
                    <Pill
                      tone={
                        m.status === "ACTIVE" ? "success" : m.status === "SHADOW" ? "info" : "muted"
                      }
                    >
                      {m.status}
                    </Pill>
                    <span className="text-xs text-muted-foreground">{STATUS_TEXT[m.status]}</span>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="inline text-muted-foreground">Trained on: </dt>
                      <dd className="inline">{m.trainedOn ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">In use: </dt>
                      <dd className="inline">
                        {day(m.effectiveFrom)} – {m.effectiveTo ? day(m.effectiveTo) : "now"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Test results: </dt>
                      <dd className="inline">
                        {m.metrics
                          ? `AUC ${String(m.metrics["auc"] ?? "—")} · Brier ${String(m.metrics["brier"] ?? "—")} · PR-AUC ${String(m.metrics["pr_auc"] ?? "—")}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Live cases scored: </dt>
                      <dd className="inline">
                        {m.casesScored.toLocaleString("en-IN")}
                        {m.lastScored ? ` (last ${day(m.lastScored)})` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Approved: </dt>
                      <dd className="inline">
                        {m.approvedBy
                          ? `${m.approvedBy}, ${day(m.approvedAt)}`
                          : "no sign-off recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Independent validation: </dt>
                      <dd className="inline">
                        {m.validatedBy ? `${m.validatedBy}, ${day(m.validatedAt)}` : "not yet"}
                      </dd>
                    </div>
                  </dl>
                  {m.validationNote && (
                    <p className="mt-2 text-xs text-muted-foreground">{m.validationNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="How the models do on real outcomes"
          description="For loans at least this long on the book: the average chance each model gave of going 30+ days late in the first 12 EMIs, against what happened. Both models are scored on the same customers, so the comparison is fair."
          action={
            <select
              id="model-months"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-xs"
              aria-label="Months on the book"
            >
              {[1, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {m} {m === 1 ? "month" : "months"}+
                </option>
              ))}
            </select>
          }
        >
          {!comparison ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4 text-right">Cases scored</th>
                    <th className="py-2 pr-4 text-right">Loans with an outcome</th>
                    <th className="py-2 pr-4 text-right">Predicted</th>
                    <th className="py-2 pr-4 text-right">Actual</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {comparison.map((r) => (
                    <tr key={r.modelVersion} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.modelVersion}</td>
                      <td className="py-2 pr-4 text-right">
                        {r.casesScored.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {r.loansWithOutcome.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2 pr-4 text-right">{pct(r.avgPredicted)}</td>
                      <td className="py-2 pr-4 text-right">{pct(r.actualLateRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Read with care: a 1.6% late rate needs thousands of seasoned loans before
                differences mean much. The plan for live data (back-test, then shadow scoring, then
                a signed-off switch) is in docs/model-governance.md.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
