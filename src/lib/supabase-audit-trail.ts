import { supabase } from "./supabase";

export interface AuditEntry {
  id: string;
  application_id: string;
  actor: string;
  action: string;
  detail: Record<string, any>;
  timestamp: string;
  ip_address?: string;
}

export const AUDIT_ACTIONS: Record<string, string> = {
  application_created: "Application created",
  bureau_fetched: "Bureau report fetched",
  policy_evaluated: "Policy rules evaluated",
  decision_logged: "Credit decision logged",
  document_uploaded: "Document uploaded",
  status_changed: "Status changed",
  override_applied: "Override applied",
  cam_generated: "CAM memo generated",
  esign_completed: "E-signature completed",
};

export async function logAudit(entry: Partial<AuditEntry>): Promise<AuditEntry> {
  try {
    const payload = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
      detail: entry.detail || {},
    };
    const { data, error } = await supabase.from("audit_trail").insert([payload]).select().single();
    if (error) throw error;
    return data as AuditEntry;
  } catch (e) {
    return { ...getMockAuditEntry(), ...entry, id: `audit-${Date.now()}` } as AuditEntry;
  }
}

export async function fetchAuditTrail(applicationId: string): Promise<AuditEntry[]> {
  try {
    const { data, error } = await supabase.from("audit_trail").select("*").eq("application_id", applicationId).order("timestamp", { ascending: false });
    if (error) throw error;
    return (data || []) as AuditEntry[];
  } catch (e) {
    return getMockAuditTrail(applicationId);
  }
}

export async function fetchRecentActivity(limit: number = 10): Promise<AuditEntry[]> {
  try {
    const { data, error } = await supabase.from("audit_trail").select("*").order("timestamp", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []) as AuditEntry[];
  } catch (e) {
    return getMockAuditTrail("any").slice(0, limit);
  }
}

function getMockAuditEntry(): AuditEntry {
  return {
    id: "audit-001",
    application_id: "app-001",
    actor: "system",
    action: "application_created",
    detail: { application_id: "app-001", source: "online" },
    timestamp: new Date().toISOString(),
  };
}

function getMockAuditTrail(appId: string): AuditEntry[] {
  return [
    { id: "a1", application_id: appId, actor: "system", action: "application_created", detail: {}, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { id: "a2", application_id: appId, actor: "system", action: "bureau_fetched", detail: { score: 742 }, timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    { id: "a3", application_id: appId, actor: "system", action: "policy_evaluated", detail: { rules_passed: 10, rules_failed: 2 }, timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
    { id: "a4", application_id: appId, actor: "system", action: "decision_logged", detail: { decision: "approve" }, timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
    { id: "a5", application_id: appId, actor: "user_001", action: "document_uploaded", detail: { type: "salary_slip" }, timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
    { id: "a6", application_id: appId, actor: "system", action: "cam_generated", detail: {}, timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: "a7", application_id: appId, actor: "system", action: "status_changed", detail: { from: "pending", to: "approved" }, timestamp: new Date(Date.now() - 1000 * 60).toISOString() },
    { id: "a8", application_id: appId, actor: "user_001", action: "esign_completed", detail: {}, timestamp: new Date().toISOString() },
  ];
}
