// Risk model governance (sql/093, fix list R9): inventory, saved scores,
// comparison on seasoned loans, and the Admin's switch for showing the score.
import { isDemoMode } from "./auth";
import { isSupabaseConfigured, supabase } from "./supabase";

export interface ModelControls {
  scoresShown: boolean;
  reason: string | null;
  changedAt: string | null;
  activeModel: string | null;
  shadowModels: string[];
}

export interface ModelInventoryRow {
  modelVersion: string;
  status: "ACTIVE" | "SHADOW" | "RETIRED";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  trainedOn: string | null;
  metrics: Record<string, unknown> | null;
  approvedAt: string | null;
  approvedBy: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  validationNote: string | null;
  notes: string | null;
  casesScored: number;
  lastScored: string | null;
}

export interface ModelComparisonRow {
  modelVersion: string;
  casesScored: number;
  loansWithOutcome: number;
  avgPredicted: number | null;
  actualLateRate: number | null;
  byGrade: Record<string, { loans: number; avg_predicted: number; actual: number }>;
}

const live = () => isSupabaseConfigured && !isDemoMode();

/** The score is shown unless the Admin has switched it off; any read failure means shown. */
export async function getModelControls(): Promise<ModelControls> {
  const fallback: ModelControls = {
    scoresShown: true,
    reason: null,
    changedAt: null,
    activeModel: null,
    shadowModels: [],
  };
  if (!live()) return fallback;
  const { data, error } = await supabase.rpc("fn_model_controls");
  if (error || !data) return fallback;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return {
    scoresShown: d.scores_shown !== false,
    reason: d.reason ?? null,
    changedAt: d.changed_at ?? null,
    activeModel: d.active_model ?? null,
    shadowModels: (d.shadow_models ?? []) as string[],
  };
}

/** Saves the scores a case was given (live and shadow). Best effort: never blocks the screen. */
export async function recordModelScores(
  applicationId: string,
  scores: { modelVersion: string; probability: number; grade: string; shown: boolean }[],
): Promise<void> {
  if (!live() || scores.length === 0) return;
  await supabase.rpc("fn_record_model_scores", {
    p_application: applicationId,
    p_scores: scores.map((s) => ({
      model_version: s.modelVersion,
      probability: Math.min(1, Math.max(0, Number(s.probability.toFixed(6)))),
      grade: s.grade,
      shown: s.shown,
    })),
  });
}

export async function setModelScoresShown(on: boolean, reason: string): Promise<ModelControls> {
  const { error } = await supabase.rpc("fn_set_model_scores_shown", { p_on: on, p_reason: reason });
  if (error) throw new Error(error.message || "Could not change the switch");
  return getModelControls();
}

export async function getModelInventory(): Promise<ModelInventoryRow[]> {
  if (!live()) return [];
  const { data, error } = await supabase.rpc("fn_model_inventory");
  if (error) throw new Error(error.message || "Could not load the models");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((m) => ({
    modelVersion: m.model_version,
    status: m.status,
    effectiveFrom: m.effective_from ?? null,
    effectiveTo: m.effective_to ?? null,
    trainedOn: m.trained_on ?? null,
    metrics: m.metrics ?? null,
    approvedAt: m.approved_at ?? null,
    approvedBy: m.approved_by ?? null,
    validatedAt: m.validated_at ?? null,
    validatedBy: m.validated_by ?? null,
    validationNote: m.validation_note ?? null,
    notes: m.notes ?? null,
    casesScored: Number(m.cases_scored) || 0,
    lastScored: m.last_scored ?? null,
  }));
}

export async function getModelComparison(months: number): Promise<ModelComparisonRow[]> {
  if (!live()) return [];
  const { data, error } = await supabase.rpc("fn_model_comparison", { p_months: months });
  if (error) throw new Error(error.message || "Could not load the comparison");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((d.models ?? []) as any[]).map((m) => ({
    modelVersion: m.model_version,
    casesScored: Number(m.cases_scored) || 0,
    loansWithOutcome: Number(m.loans_with_outcome) || 0,
    avgPredicted: m.avg_predicted == null ? null : Number(m.avg_predicted),
    actualLateRate: m.actual_late_rate == null ? null : Number(m.actual_late_rate),
    byGrade: m.by_grade ?? {},
  }));
}
