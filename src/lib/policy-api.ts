/**
 * Credit control: reading the policy in force and moving a change through
 * propose → approve → live (sql/016, 023, 024).
 *
 * Every call goes to a database function that checks the caller's rights, so a
 * screen can only offer what the database would allow anyway. In demo mode
 * nothing is written and the screens fall back to their sample data.
 */
import { isDemoMode } from "./auth";
import { isSupabaseConfigured, supabase } from "./supabase";

export type PolicyStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "REJECTED"
  | "CANCELLED";

/** Settings the database stores as numbers (sql/016 ck_param_value_type). */
export const NUMERIC_VALUE_TYPES = ["number", "percent", "amount_inr", "months", "score"];

export type PolicyVersion = {
  id: string;
  authoredBy: string | null;
  versionCode: string;
  status: PolicyStatus;
  tier: string | null;
  rationale: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
};

export type PolicySetting = {
  key: string;
  label: string;
  section: string;
  value: number | string | boolean | null;
  liveValue: number | string | boolean | null;
  valueType: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  description: string | null;
};

export type PendingChange = {
  versionId: string;
  versionCode: string;
  tier: string | null;
  rationale: string;
  title: string | null;
  summary: string | null;
  author: string | null;
  submittedAt: string | null;
  mine: boolean;
};

export type PolicyResult<T> = { ok: true; data: T } | { ok: false; error: string };

const unavailable = { ok: false as const, error: "Not connected to the database" };

/** Rows as the database returns them (snake_case). */
type VersionRow = {
  id: string; version_code: string; status: PolicyStatus; tier: string | null; rationale: string | null; authored_by: string | null;
  effective_from: string | null; effective_to: string | null; submitted_at: string | null; approved_at: string | null;
};
type SettingRow = {
  param_key: string; label: string | null; section: string | null; value: unknown; live_value: unknown;
  value_type: string | null; unit: string | null; min_value: number | null; max_value: number | null; description: string | null;
};
type PendingRow = {
  version_id: string; version_code: string; tier: string | null; rationale: string | null; title: string | null;
  summary: string | null; author: string | null; submitted_at: string | null; mine: boolean | null;
};

function fail(error: { message?: string } | null, fallback: string): PolicyResult<never> {
  // Database messages are written for people ("a reason is required"), so they
  // are shown as they are rather than replaced with a generic failure.
  return { ok: false, error: error?.message?.replace(/^.*?:\s*(?=[a-z])/, "") || fallback };
}

export async function getPolicyVersions(): Promise<PolicyVersion[]> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase
    .from("policy_versions")
    .select("id, version_code, status, tier, rationale, authored_by, effective_from, effective_to, submitted_at, approved_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as VersionRow[]).map((r) => ({
    id: String(r.id),
    versionCode: String(r.version_code),
    authoredBy: r.authored_by ?? null,
    status: r.status,
    tier: r.tier ?? null,
    rationale: String(r.rationale ?? ""),
    effectiveFrom: r.effective_from ?? null,
    effectiveTo: r.effective_to ?? null,
    submittedAt: r.submitted_at ?? null,
    approvedAt: r.approved_at ?? null,
  }));
}

export async function getPolicySettings(versionId: string): Promise<PolicySetting[]> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase.rpc("fn_policy_settings", { p_version_id: versionId });
  if (error || !data) return [];
  return (data as SettingRow[]).map((r) => ({
    key: String(r.param_key),
    label: String(r.label ?? r.param_key),
    section: String(r.section ?? ""),
    value: r.value as PolicySetting["value"],
    liveValue: r.live_value as PolicySetting["value"],
    valueType: String(r.value_type ?? "number"),
    unit: r.unit ?? null,
    min: r.min_value === null || r.min_value === undefined ? null : Number(r.min_value),
    max: r.max_value === null || r.max_value === undefined ? null : Number(r.max_value),
    description: r.description ?? null,
  }));
}

export async function getPendingChanges(): Promise<PendingChange[]> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase.rpc("fn_policy_pending");
  if (error || !data) return [];
  return (data as PendingRow[]).map((r) => ({
    versionId: String(r.version_id),
    versionCode: String(r.version_code),
    tier: r.tier ?? null,
    rationale: String(r.rationale ?? ""),
    title: r.title ?? null,
    summary: r.summary ?? null,
    author: r.author ?? null,
    submittedAt: r.submitted_at ?? null,
    mine: r.mine === true,
  }));
}

export async function createPolicyDraft(input: {
  versionCode: string;
  rationale: string;
  tier?: "MATERIAL" | "STANDARD" | "COSMETIC";
}): Promise<PolicyResult<{ versionId: string }>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { data, error } = await supabase.rpc("fn_policy_draft_create", {
    p_version_code: input.versionCode,
    p_rationale: input.rationale,
    p_tier: input.tier ?? "STANDARD",
  });
  if (error) return fail(error, "Could not start the draft");
  return { ok: true, data: { versionId: String((data as { versionId: string }).versionId) } };
}

export async function setDraftSetting(
  versionId: string,
  key: string,
  value: number | string | boolean
): Promise<PolicyResult<null>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { error } = await supabase.rpc("fn_policy_draft_set_param", {
    p_version_id: versionId,
    p_key: key,
    p_value: value,
  });
  if (error) return fail(error, "Could not save that value");
  return { ok: true, data: null };
}

export async function discardDraft(versionId: string): Promise<PolicyResult<null>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { error } = await supabase.rpc("fn_policy_draft_discard", { p_version_id: versionId });
  if (error) return fail(error, "Could not discard the draft");
  return { ok: true, data: null };
}

export async function submitForApproval(
  versionId: string,
  title: string,
  summary?: string
): Promise<PolicyResult<null>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { error } = await supabase.rpc("fn_policy_submit", {
    p_version_id: versionId,
    p_title: title,
    p_summary: summary ?? null,
  });
  if (error) return fail(error, "Could not send it for approval");
  return { ok: true, data: null };
}

export async function withdrawChange(versionId: string, reason?: string): Promise<PolicyResult<null>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { error } = await supabase.rpc("fn_policy_withdraw", {
    p_version_id: versionId,
    p_reason: reason ?? null,
  });
  if (error) return fail(error, "Could not withdraw it");
  return { ok: true, data: null };
}

export async function approveChange(
  versionId: string,
  effectiveFrom: string,
  comment?: string
): Promise<PolicyResult<null>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { error } = await supabase.rpc("fn_policy_approve", {
    p_version_id: versionId,
    p_effective_from: effectiveFrom,
    p_comment: comment ?? null,
  });
  if (error) return fail(error, "Could not approve it");
  return { ok: true, data: null };
}

export async function rejectChange(versionId: string, comment: string): Promise<PolicyResult<null>> {
  if (!isSupabaseConfigured || isDemoMode()) return unavailable;
  const { error } = await supabase.rpc("fn_policy_reject", {
    p_version_id: versionId,
    p_comment: comment,
  });
  if (error) return fail(error, "Could not reject it");
  return { ok: true, data: null };
}

/** "8.99" with its unit, for display. */
export function formatSettingValue(s: Pick<PolicySetting, "value" | "unit">): string {
  if (s.value === null || s.value === undefined) return "—";
  if (typeof s.value === "boolean") return s.value ? "Yes" : "No";
  return s.unit ? `${s.value}${s.unit === "%" ? "%" : ` ${s.unit}`}` : String(s.value);
}
