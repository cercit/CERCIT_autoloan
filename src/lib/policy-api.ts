/**
 * Credit control: reading the policy in force and moving a change through
 * propose → approve → live (sql/016, 023, 024).
 *
 * Every call goes to a database function that checks the caller's rights, so a
 * screen can only offer what the database would allow anyway. In demo mode
 * nothing is written and the screens fall back to their sample data.
 */
import { getRateGrid, type RateGridData } from "./api";
import { isDemoMode } from "./auth";
import type { EmployerCategoryPricing, RateBand } from "./mock-data";
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

// ---------------------------------------------------------------------------
// Impact check on a proposal (backlog CC3.1 engine, CC3.2 screen)
// ---------------------------------------------------------------------------

export type Decision = "approve" | "review" | "decline";

export type ImpactCheck = {
  /** Applications judged under both versions. */
  evaluated: number;
  /** Applications that could not be judged because a fact was missing. */
  skipped: number;
  changed: number;
  before: Record<Decision, number>;
  after: Record<Decision, number>;
  /** "approve->decline": count */
  flips: Record<string, number>;
  /** Facts nobody recorded, and on how many applications. A rule reading one never fires. */
  factsNotKnown: Record<string, number>;
  skippedBecauseMissing: Record<string, number>;
  comparedTo: string | null;
  runBy: string | null;
  runAt: string;
};

type ImpactRow = {
  sample_size: number; flips: Record<string, number> | null; summary: Record<string, unknown> | null;
  compared_to: string | null; run_by: string | null; run_at: string;
};

const counts = (v: unknown): Record<string, number> =>
  v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, n]) => [k, Number(n) || 0])) : {};

/** The latest impact check recorded for a version, or null if none has run. */
export async function getImpact(versionId: string): Promise<ImpactCheck | null> {
  if (!isSupabaseConfigured || isDemoMode()) return null;
  const { data, error } = await supabase.rpc("fn_policy_impact", { p_version_id: versionId });
  const row = (data as ImpactRow[] | null)?.[0];
  if (error || !row) return null;
  const summary = row.summary ?? {};
  const decisions = (v: unknown) => ({ approve: 0, review: 0, decline: 0, ...counts(v) }) as Record<Decision, number>;
  return {
    evaluated: Number(summary["evaluated"] ?? row.sample_size) || 0,
    skipped: Number(summary["skipped"] ?? 0) || 0,
    changed: Number(summary["changed"] ?? 0) || 0,
    before: decisions(summary["before"]),
    after: decisions(summary["after"]),
    flips: counts(row.flips),
    factsNotKnown: counts(summary["factsNotKnown"]),
    skippedBecauseMissing: counts(summary["skippedBecauseMissing"]),
    comparedTo: row.compared_to ?? null,
    runBy: row.run_by ?? null,
    runAt: row.run_at,
  };
}

/**
 * Re-runs recent applications through the proposal and the version in force, on
 * the rules engine. The engine checks the caller's rights in their own name and
 * records the result, which getImpact then reads.
 */
export async function runImpactCheck(versionId: string): Promise<PolicyResult<null>> {
  const base = import.meta.env["VITE_AWS_API_URL"] ?? "";
  if (!isSupabaseConfigured || isDemoMode() || !base) return { ok: false, error: "The rules engine is not connected" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Sign in again to run the check" };
  try {
    const res = await fetch(`${String(base).replace(/\/$/, "")}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ versionId, limit: 200, record: true }),
    });
    if (res.ok) return { ok: true, data: null };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 403) return { ok: false, error: "Your role cannot run impact checks" };
    return { ok: false, error: body.error ?? `The rules engine answered ${res.status}` };
  } catch {
    return { ok: false, error: "Could not reach the rules engine" };
  }
}

/** "8.99" with its unit, for display. */
export function formatSettingValue(s: Pick<PolicySetting, "value" | "unit">): string {
  if (s.value === null || s.value === undefined) return "—";
  if (typeof s.value === "boolean") return s.value ? "Yes" : "No";
  return s.unit ? `${s.value}${s.unit === "%" ? "%" : ` ${s.unit}`}` : String(s.value);
}

// ---------------------------------------------------------------------------
// Rate grid from the approved version (backlog CC2.2)
// ---------------------------------------------------------------------------

export type RateGridFromPolicy = {
  versionCode: string;
  effectiveFrom: string | null;
  data: RateGridData;
  /** Where the pricing tables the current engine reads differ from the approved version. */
  drift: { what: string; approved: number; inTables: number }[];
};

const num = (v: PolicySetting["value"] | undefined): number => (typeof v === "number" ? v : Number(v ?? 0));

/**
 * The rate grid as the approved policy version states it. Band labels and
 * category descriptions are not policy settings, so they come from the
 * existing tables; every number comes from the version in force.
 */
export async function getRateGridFromPolicy(): Promise<RateGridFromPolicy | null> {
  if (!isSupabaseConfigured || isDemoMode()) return null;
  const versions = await getPolicyVersions();
  const live = versions.find((v) => v.status === "ACTIVE");
  if (!live) return null;

  const [settings, tables] = await Promise.all([getPolicySettings(live.id), getRateGrid()]);
  if (settings.length === 0) return null;
  const s = Object.fromEntries(settings.map((x) => [x.key, x.value]));

  const approveMin = num(s["bureau.band_min.approve"]);
  const maybeMin = num(s["bureau.band_min.maybe"]);
  const bands: RateBand[] = [
    {
      band: `${approveMin} – 900`,
      label: "APPROVE",
      baseRate: num(s["pricing.base_rate.approve"]),
      maxLtvPct: num(s["caps.max_ltv_pct.approve"]),
      maxFoirPct: num(s["caps.max_foir_pct.approve"]),
      maxTenureMonths: num(s["caps.max_tenure_months.approve"]),
    },
    {
      band: `${maybeMin} – ${approveMin - 1}`,
      label: "MAYBE",
      baseRate: num(s["pricing.base_rate.maybe"]),
      maxLtvPct: num(s["caps.max_ltv_pct.maybe"]),
      maxFoirPct: num(s["caps.max_foir_pct.maybe"]),
      maxTenureMonths: num(s["caps.max_tenure_months.maybe"]),
    },
    { band: `Below ${maybeMin}`, label: "REJECT", baseRate: 0, maxLtvPct: 0, maxFoirPct: 0, maxTenureMonths: 0 },
  ];

  const categories: EmployerCategoryPricing[] = (["A", "B", "C"] as const).map((code) => {
    const k = code.toLowerCase();
    const known = tables.categories.find((c) => c.code === code);
    return {
      code,
      label: known?.label ?? `Category ${code}`,
      description: known?.description ?? "",
      loadingPct: num(s[`pricing.loading.cat_${k}`]),
      maxLtvPct: num(s[`caps.max_ltv_pct.cat_${k}`]),
      maxTenureMonths: num(s[`caps.max_tenure_months.cat_${k}`]),
      processingFeeInr: num(s[`charges.processing_fee.cat_${k}`]),
    };
  });

  // Until pricing is read from the policy itself (FD5), recommendations are still
  // priced from the old tables. Any difference means a rate is being charged that
  // nobody approved, so it is shown rather than hidden.
  const drift: RateGridFromPolicy["drift"] = [];
  const compare = (what: string, approved: number, inTables: number | undefined) => {
    if (inTables !== undefined && Math.abs(approved - inTables) > 0.001) drift.push({ what, approved, inTables });
  };
  for (const b of bands.filter((x) => x.label !== "REJECT")) {
    const t = tables.bands.find((x) => x.label === b.label);
    compare(`${b.label} base rate`, b.baseRate, t?.baseRate);
    compare(`${b.label} max LTV`, b.maxLtvPct, t?.maxLtvPct);
    compare(`${b.label} max FOIR`, b.maxFoirPct, t?.maxFoirPct);
    compare(`${b.label} max tenure`, b.maxTenureMonths, t?.maxTenureMonths);
  }
  for (const c of categories) {
    const t = tables.categories.find((x) => x.code === c.code);
    compare(`Category ${c.code} loading`, c.loadingPct, t?.loadingPct);
    compare(`Category ${c.code} max LTV`, c.maxLtvPct, t?.maxLtvPct);
    compare(`Category ${c.code} max tenure`, c.maxTenureMonths, t?.maxTenureMonths);
    compare(`Category ${c.code} processing fee`, c.processingFeeInr, t?.processingFeeInr);
  }

  return { versionCode: live.versionCode, effectiveFrom: live.effectiveFrom, data: { bands, categories }, drift };
}
