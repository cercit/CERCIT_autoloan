import { supabase } from "./supabase";

export interface DecisionLogRow {
  id: string;
  application_id: string;
  decision: "approve" | "review" | "decline";
  band: string;
  bureau_score: number;
  foir_percent: number;
  ltv_percent: number;
  risk_score: number;
  risk_grade: string;
  passed_rules: string[];
  failed_rules: string[];
  recommendation: string;
  decided_by: "system" | "manual";
  reviewer_id?: string;
  reviewer_name?: string;
  override_applied?: boolean;
  override_reason?: string;
  override_by?: string;
  created_at: string;
  updated_at: string;
}

export async function logDecision(data: Partial<DecisionLogRow>): Promise<DecisionLogRow> {
  try {
    const payload = { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), decided_by: data.decided_by || "system" };
    const { data: result, error } = await supabase.from("decision_logs").insert([payload]).select().single();
    if (error) throw error;
    return result as DecisionLogRow;
  } catch (e) {
    return { ...getMockDecisionLog(), ...data, id: `mock-decision-${Date.now()}` } as DecisionLogRow;
  }
}

export async function fetchDecisionLog(applicationId: string): Promise<DecisionLogRow[]> {
  try {
    const { data, error } = await supabase.from("decision_logs").select("*").eq("application_id", applicationId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as DecisionLogRow[];
  } catch (e) {
    return [getMockDecisionLog(applicationId)];
  }
}

export async function fetchDecisionHistory(filters?: { decision?: string; reviewer?: string; from?: string; to?: string }): Promise<DecisionLogRow[]> {
  try {
    let query = supabase.from("decision_logs").select("*").order("created_at", { ascending: false });
    if (filters?.decision) query = query.eq("decision", filters.decision);
    if (filters?.reviewer) query = query.eq("reviewer_id", filters.reviewer);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as DecisionLogRow[];
  } catch (e) {
    return [getMockDecisionLog("mock")];
  }
}

export async function overrideDecision(
  id: string,
  reviewerId: string,
  newDecision: "approve" | "review" | "decline",
  reason: string
): Promise<DecisionLogRow | null> {
  try {
    const { data, error } = await supabase.from("decision_logs").update({
      decision: newDecision,
      override_applied: true,
      override_reason: reason,
      override_by: reviewerId,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    return data as DecisionLogRow;
  } catch (e) {
    return null;
  }
}

function getMockDecisionLog(applicationId?: string): DecisionLogRow {
  return {
    id: `log-${applicationId || "mock"}`,
    application_id: applicationId || "app-001",
    decision: "approve",
    band: "green",
    bureau_score: 742,
    foir_percent: 42.3,
    ltv_percent: 78,
    risk_score: 850,
    risk_grade: "B",
    passed_rules: ["FOIR_LIMIT", "BUREAU_GOOD", "NO_SEVERE_DPD", "SALARY_REGULAR"],
    failed_rules: ["LTV_OPTIMAL"],
    recommendation: "Approved with minor LTV deviation.",
    decided_by: "system",
    reviewer_id: "rev-001",
    reviewer_name: "Credit Officer",
    override_applied: false,
    override_reason: undefined,
    override_by: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
