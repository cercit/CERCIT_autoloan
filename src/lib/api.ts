import { supabase, isSupabaseConfigured } from "./supabase";
import { assessIfServerEngineOn } from "./engine-api";
import { isDemoMode } from "./auth";
import {
  applications as mockApplications,
  policyRules as mockPolicyRules,
  policyTabs as mockPolicyTabs,
  auditLog as mockAuditLog,
  makes as mockMakes,
  mockBureauReport,
  mockBankStatementSummary,
  mockTransactions,
  rateBands as mockRateBands,
  employerCategoryPricing as mockEmployerCategoryPricing,
} from "./mock-data";
import type {
  Application,
  PolicyRule,
  BureauReport,
  BankStatementSummary,
  BankTransaction,
  RateBand,
  EmployerCategoryPricing,
} from "./mock-data";
import { z } from "zod";


const applicationRowSchema = z.object({
  application_id: z.string().transform((v) => v ?? ""),
  full_name: z.string().optional().default(""),
  employer_name: z.string().optional().default(""),
  cibil_score: z.coerce.number().optional().default(0),
  loan_amount_requested: z.coerce.number().optional().default(0),
  status: z.string().optional().default("DRAFT"),
  created_at: z.string().optional(),
  officer_name: z.string().optional().default("Unassigned"),
  decision: z.string().optional(),
  rate: z.coerce.number().optional().default(0),
  tenure_months: z.coerce.number().optional().default(0),
  foir_pct: z.coerce.number().optional().default(0),
  ltv_pct: z.coerce.number().optional().default(0),
  declared_net_salary: z.coerce.number().optional().default(0),
  age_at_application: z.coerce.number().optional().default(0),
  pan_number: z.string().optional().default(""),
  mobile: z.string().optional().default(""),
  email: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state_code: z.string().optional().default(""),
  state_name: z.string().optional().default(""),
  address_line1: z.string().optional().default(""),
  address_line2: z.string().optional().default(""),
  pincode: z.string().optional().default(""),
  residence_type: z.string().optional().default(""),
  designation: z.string().optional().default(""),
  years_in_current_job: z.coerce.number().optional().default(0),
  total_work_experience_years: z.coerce.number().optional().default(0),
  salary_bank_name: z.string().optional().default(""),
  vehicle_make: z.string().optional(),
  vehicle_model: z.string().optional(),
  vehicle_variant: z.string().optional(),
  dealer_name: z.string().optional().default(""),
  ex_showroom_price: z.coerce.number().optional().default(0),
  on_road_price: z.coerce.number().optional().default(0),
  risk_factors: z.array(z.any()).optional().default([]),
  origin: z.string().nullish(),
}).transform((row) => ({
  id: row.application_id,
  origin: row.origin ?? undefined,
  name: row.full_name,
  employer: row.employer_name,
  category: mapCategory(row.cibil_score),
  loanAmount: row.loan_amount_requested,
  cibil: row.cibil_score,
  status: mapStatus(row.status),
  submitted: formatDate(row.created_at ?? ""),
  assignedTo: row.officer_name,
  recommendation: mapDecision(row.decision ?? ""),
  rate: row.rate,
  tenure: row.tenure_months,
  foir: row.foir_pct,
  ltvExShowroom: row.ltv_pct,
  ltvOnRoad: 0,
  netIncome: row.declared_net_salary,
  age: row.age_at_application,
  pan: row.pan_number,
  aadhaar: "",
  phone: row.mobile,
  email: row.email,
  city: row.city,
  state: row.state_name || row.state_code,
  address: `${row.address_line1 ?? ""}${row.address_line2 ? ", " + row.address_line2 : ""}${row.pincode ? " - " + row.pincode : ""}`,
  residence: row.residence_type ?? "",
  designation: row.designation ?? "",
  totalExperience: row.total_work_experience_years ? row.total_work_experience_years + " years" : "",
  currentTenure: row.years_in_current_job ? row.years_in_current_job + " years" : "",
  salaryBank: row.salary_bank_name ?? "",
  vehicle: `${row.vehicle_make ?? ""} ${row.vehicle_model ?? ""} ${row.vehicle_variant ?? ""}`.trim(),
  dealer: row.dealer_name,
  exShowroom: row.ex_showroom_price,
  onRoad: row.on_road_price,
  obligations: [],
  // the engine stores every rule it checked; the flags are the ones that failed
  flags: (row.risk_factors as Array<{ message?: string; rule_name?: string; result?: string }>)
    .filter((f) => f.result === undefined || f.result === "FAIL")
    .map((f) => f.message ?? f.rule_name ?? "")
    .filter(Boolean),
  reasons: [],
  ...((row.risk_factors as Array<{ rule_name?: string }>).some((f) => f.rule_name)
    ? {
        ruleChecks: (row.risk_factors as Array<{ rule_name?: string; threshold?: unknown; actual?: unknown; result?: string }>)
          .filter((f) => f.rule_name && f.result !== "SKIPPED")
          .map((f) => ({
            rule: f.rule_name ?? "",
            expected: f.threshold == null ? "—" : String(f.threshold),
            actual: f.actual == null ? "—" : String(f.actual),
            pass: f.result !== "FAIL",
          })),
      }
    : {}),
} as Application));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToApplication(row: Record<string, unknown>): Application {
  // The database sends null for empty fields (a customer case approved in principle has no
  // car yet); the schema's defaults expect them absent, so a null would fail the whole list.
  const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
  return applicationRowSchema.parse(clean);
}

function mapCategory(cibil: number): "A" | "B" | "C" {
  if (cibil >= 750) return "A";
  if (cibil >= 650) return "B";
  return "C";
}

function mapStatus(status: string): Application["status"] {
  const map: Record<string, Application["status"]> = {
    DRAFT: "New",
    IN_PRINCIPLE_APPROVED: "New",
    DOCUMENTS_SUBMITTED: "Documents Uploaded",
    UNDER_ASSESSMENT: "Under Review",
    UNDER_REVIEW: "Referred",
    APPROVED: "Sanctioned",
    DISBURSED: "Disbursed",
    REJECTED: "Rejected",
  };
  return map[status] ?? "New";
}

function mapDecision(decision: string): "Approve" | "Maybe" | "Reject" {
  if (decision === "APPROVE") return "Approve";
  if (decision === "REJECT") return "Reject";
  return "Maybe";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}


// -- Application Review (sql/061, fix list C5) -----------------------------------
// Staff can't read the case tables directly (privacy rules), so the review page,
// its bureau, bank and timeline tabs and the duplicate check all come from one
// function, fn_staff_application_review. One call per case, shared for a few seconds.

/* eslint-disable @typescript-eslint/no-explicit-any */
type ReviewBundle = { case: any; obligations: any[]; bureau: any | null; bank: any | null; timeline: any[]; duplicates: any[] };
/* eslint-enable @typescript-eslint/no-explicit-any */

const reviewCache = new Map<string, Promise<ReviewBundle>>();

function applicationReview(applicationId: string): Promise<ReviewBundle> {
  let p = reviewCache.get(applicationId);
  if (!p) {
    p = Promise.resolve(supabase.rpc("fn_staff_application_review", { p_application_id: applicationId })).then(
      ({ data, error }) => {
        if (error) throw new Error(error.message || "Could not load this application");
        if (!data) throw new Error("application not found");
        return data as ReviewBundle;
      },
    );
    reviewCache.set(applicationId, p);
    const drop = () => setTimeout(() => reviewCache.delete(applicationId), 5000);
    p.then(drop, () => reviewCache.delete(applicationId));
  }
  return p;
}

/** Forget the cached case so the next read fetches it again (after a decision or override). */
export function refreshApplication(applicationId: string): void {
  reviewCache.delete(applicationId);
}

export async function getBureauReport(applicationId: string): Promise<BureauReport | null> {
  if (!isSupabaseConfigured || isDemoMode()) return mockBureauReport;

  const b = (await applicationReview(applicationId)).bureau;
  if (!b) return null;
  const n = (v: unknown) => Number(v) || 0;
  // The stored summary has the worst late payment, not a month-by-month grid; show that one line.
  const worst = n(b.dpd_max_24m);
  const bucket = worst >= 90 ? "90+" : worst >= 60 || b.dpd_60_plus_flag ? "60+" : worst >= 30 ? "30+" : null;
  return {
    score: n(b.score),
    activeAccounts: n(b.active_accounts),
    closedAccounts: 0,
    overdueAccounts: n(b.dpd_30_count_24m),
    totalOutstanding: n(b.total_outstanding),
    totalExposure: 0,
    enquiries90Days: n(b.enquiry_count_90d),
    enquiries: { last3Months: n(b.enquiry_count_90d), last6Months: 0, last12Months: 0 },
    oldestAccountMonths: n(b.oldest_account_months),
    oldestAccountAge: b.oldest_account_months ? `${Math.floor(n(b.oldest_account_months) / 12)} yrs ${n(b.oldest_account_months) % 12} mths` : "—",
    writeoffs: n(b.writeoff_count_5y) > 0,
    settlements: n(b.settled_count_5y) > 0,
    suitsFiled: false,
    dpdHistory: bucket ? [{ account: "Worst of all accounts, 24 months", months: [bucket] }] : [],
    ...(b.credit_utilization_pct == null ? {} : { creditCardUtilization: n(b.credit_utilization_pct) }),
  };
}

// -- Applications list, a page at a time (sql/066, fix list C4) -------------------

/** The list's status filter, in the database's words. */
export const STATUS_FILTER: Record<string, string[]> = {
  New: ["DRAFT", "SUBMITTED", "IN_PRINCIPLE_APPROVED"],
  "Documents Uploaded": ["DOCUMENTS_SUBMITTED"],
  "Under Review": ["UNDER_ASSESSMENT"],
  Referred: ["UNDER_REVIEW"],
  Sanctioned: ["APPROVED"],
  Disbursed: ["DISBURSED"],
  Rejected: ["REJECTED"],
};

export type ApplicationsQuery = {
  search?: string;
  status?: string;
  sort?: "submitted" | "name" | "loan" | "cibil" | "status";
  desc?: boolean;
  page?: number;
  pageSize?: number;
};

export type ApplicationsPage = { total: number; page: number; pageSize: number; rows: Application[] };

const engineOutcome = (d: unknown): string | undefined => {
  const v = String(d ?? "").toUpperCase();
  return v === "APPROVE" ? "APPROVE" : v === "REVIEW" ? "MAYBE" : v === "DECLINE" ? "REJECT" : undefined;
};

/**
 * One page of the Applications list, searched, filtered and sorted in the
 * database, with the server engine's decision on each row. Throws on an error.
 */
export async function getApplicationsPage(q: ApplicationsQuery = {}): Promise<ApplicationsPage> {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  if (!isSupabaseConfigured || isDemoMode()) {
    const term = (q.search ?? "").trim().toLowerCase();
    const rows = mockApplications.filter(
      (a) =>
        (!q.status || q.status === "All statuses" || a.status === q.status) &&
        (!term || [a.name, a.id, a.pan, a.employer].some((v) => v.toLowerCase().includes(term))),
    );
    return { total: rows.length, page, pageSize, rows: rows.slice((page - 1) * pageSize, page * pageSize) };
  }
  const { data, error } = await supabase.rpc("fn_list_applications_page", {
    p_search: q.search?.trim() || null,
    p_statuses: q.status && STATUS_FILTER[q.status] ? STATUS_FILTER[q.status] : null,
    p_sort: q.sort ?? "submitted",
    p_desc: q.desc ?? true,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw new Error(error.message || "Could not load the applications");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as { total?: number; page?: number; page_size?: number; rows?: any[] };
  return {
    total: Number(d.total) || 0,
    page: Number(d.page) || page,
    pageSize: Number(d.page_size) || pageSize,
    rows: (d.rows ?? []).map((row) => {
      const app = mapToApplication(row);
      const engine = engineOutcome(row.engine_decision);
      return engine ? { ...app, engineOutcome: engine } : app;
    }),
  };
}

export async function getApplication(
  id: string
): Promise<Application | undefined> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return mockApplications.find((a) => a.id === id);
  }

  const r = await applicationReview(id);
  const baseApp = mapToApplication({ ...r.case, cibil_score: r.case.cibil_score ?? 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obligations = (r.obligations ?? []).map((o: any) => ({
    lender: o.lender_name ?? "",
    type: o.obligation_type ?? "",
    emi: Number(o.monthly_emi) || 0,
    outstanding: Number(o.outstanding_amount) || 0,
    dpd: String(o.dpd_current ?? "0"),
    source: o.source ?? "Bureau",
  }));

  const c = r.case;
  return {
    ...baseApp,
    obligations,
    ...(c.policy_version ? { policyVersionId: String(c.policy_version) } : {}),
    ...(c.rules_snapshot ? { rulesSnapshot: String(c.rules_snapshot) } : {}),
    ...(c.model_version ? { modelVersion: String(c.model_version) } : {}),
    ...(c.version_basis === "RECORDED" || c.version_basis === "ASSUMED" ? { versionBasis: c.version_basis as "RECORDED" | "ASSUMED" } : {}),
  };
}

export async function createApplication(
  fullName: string,
  email: string,
  mobile: string
): Promise<{ applicationId: string; applicationUuid: string } | null> {
  if (!isSupabaseConfigured || isDemoMode()) return null;

  const { data, error } = await supabase.rpc("fn_create_application", {
    p_full_name: fullName,
    p_email: email,
    p_mobile: mobile,
  });

  if (error || !data) {
    console.error("Failed to create application:", error);
    return null;
  }

  return {
    applicationId: data.application_id,
    applicationUuid: data.application_uuid,
  };
}

export async function assessApplication(
  applicationUuid: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  if (!isSupabaseConfigured || isDemoMode()) return null;

  const { data, error } = await supabase.rpc("fn_assess_application", {
    p_application_id: applicationUuid,
  });

  if (error || !data) {
    console.error("Assessment failed:", error);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any;
}

const operatorMap: Record<string, string> = {
  GTE: ">=",
  LTE: "<=",
  EQ: "=",
  GT: ">",
  LT: "<",
  NEQ: "!=",
};

const categoryLabel: Record<string, string> = {
  HARD_FILTER: "Age",
  BUREAU: "CIBIL",
  INCOME: "FOIR",
  COLLATERAL: "LTV",
  BANK_STATEMENT: "Bank Statement",
  ELIGIBILITY: "Employment",
};

function mapSeverityToAction(
  severity: string
): "Approve" | "Maybe" | "Reject" {
  if (severity === "REJECT") return "Reject";
  if (severity === "MAYBE") return "Maybe";
  return "Approve";
}

/** A rule change on a policy version that isn't live yet (sql/074, G2). */
export type RuleChange = {
  version_id: string;
  version_code: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED";
  mine: boolean;
  author: string | null;
  effective_from: string | null;
  rule_id: string;
  is_active: boolean | null;
  threshold_value: string | null;
  severity_on_fail: "REJECT" | "MAYBE" | null;
  before: { is_active: boolean; threshold_value: string; severity_on_fail: string };
};

export type RuleRaw = { threshold_value: string; threshold_unit: string | null; severity_on_fail: string; name: string };

export type PolicyInForce = {
  versionCode: string;
  effectiveFrom: string | null;
  approvedBy: string | null;
  lastChange: { versionCode: string; toStatus: string; at: string; by: string } | null;
};

export async function getMappedPolicyRules(): Promise<{
  rules: Record<string, PolicyRule[]>;
  tabs: string[];
  inForce: PolicyInForce | null;
  raw: Record<string, RuleRaw>;
  changes: RuleChange[];
  canAuthor: boolean;
  canApprove: boolean;
}> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return { rules: mockPolicyRules, tabs: mockPolicyTabs, inForce: null, raw: {}, changes: [], canAuthor: false, canApprove: false };
  }

  // Signed-in staff read the rules through fn_staff_policy_rules (sql/063); an
  // error is shown on the page, never replaced with sample rules.
  const { data, error } = await supabase.rpc("fn_staff_policy_rules");
  if (error) throw new Error(error.message || "Could not load the credit rules");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (data ?? {}) as { rules?: any[]; version?: any; last_change?: any; changes?: RuleChange[]; can_author?: boolean; can_approve?: boolean };
  const raw: Record<string, RuleRaw> = {};

  const grouped: Record<string, PolicyRule[]> = {};
  for (const row of payload.rules ?? []) {
    const tab = categoryLabel[row.category] ?? row.category;
    const rule: PolicyRule = {
      id: row.rule_id,
      name: row.rule_name,
      parameter: row.parameter,
      operator: operatorMap[row.operator] ?? row.operator,
      threshold: row.threshold_unit
        ? `${row.threshold_value} ${row.threshold_unit.toLowerCase()}`
        : row.threshold_value,
      action: mapSeverityToAction(row.severity_on_fail),
      from: formatDate(row.created_at),
      to: "—",
      active: row.is_active,
    };
    if (!grouped[tab]) grouped[tab] = [];
    grouped[tab].push(rule);
    raw[row.rule_id] = { threshold_value: row.threshold_value, threshold_unit: row.threshold_unit, severity_on_fail: row.severity_on_fail, name: row.rule_name };
  }

  const v = payload.version;
  const c = payload.last_change;
  return {
    rules: grouped,
    tabs: Object.keys(grouped),
    inForce: v
      ? {
          versionCode: v.version_code,
          effectiveFrom: v.effective_from ?? null,
          approvedBy: v.approved_by ?? null,
          lastChange: c ? { versionCode: c.version_code, toStatus: c.to_status, at: c.at, by: c.by } : null,
        }
      : null,
    raw,
    changes: payload.changes ?? [],
    canAuthor: Boolean(payload.can_author),
    canApprove: Boolean(payload.can_approve),
  };
}

/** Put a rule change on my draft policy version (sql/074): on/off, a new limit, or what happens if it fails. */
export async function draftRuleChange(
  ruleId: string,
  change: { isActive?: boolean; threshold?: string; severity?: "REJECT" | "MAYBE" },
): Promise<void> {
  const { error } = await supabase.rpc("fn_policy_rule_draft", {
    p_rule_id: ruleId,
    p_is_active: change.isActive ?? null,
    p_threshold: change.threshold ?? null,
    p_severity: change.severity ?? null,
  });
  if (error) throw new Error(error.message || "Could not record the change");
}

export async function removeRuleChange(ruleId: string): Promise<void> {
  const { error } = await supabase.rpc("fn_policy_rule_draft_remove", { p_rule_id: ruleId });
  if (error) throw new Error(error.message || "Could not take the change back");
}

/** Make approved versions whose date has come live (policy approvers; 023). */
export async function activateDuePolicy(): Promise<void> {
  await supabase.rpc("fn_policy_activate_due");
}


const rateBandRowSchema = z.object({
  band_label: z.string().optional().default(""),
  score_band_min: z.coerce.number().optional().default(0),
  score_band_max: z.coerce.number().optional().default(0),
  rate_pct: z.coerce.number().optional().default(0),
  max_ltv_pct: z.coerce.number().optional().default(0),
  max_foir_pct: z.coerce.number().optional().default(0),
  max_tenure_months: z.coerce.number().optional().default(0),
});

const employerCategoryRowSchema = z.object({
  category_code: z.string(),
  category_label: z.string().optional().default(""),
  description: z.string().optional().default(""),
  rate_loading_pct: z.coerce.number().optional().default(0),
  max_ltv_pct: z.coerce.number().optional().default(0),
  max_tenure_months: z.coerce.number().optional().default(0),
  processing_fee_inr: z.coerce.number().optional().default(0),
});

export type RateGridData = {
  bands: RateBand[];
  categories: EmployerCategoryPricing[];
};

const mockRateGridData: RateGridData = {
  bands: mockRateBands,
  categories: mockEmployerCategoryPricing,
};

/**
 * Rate grid = CIBIL decision band (base rate + caps) x employer category (loading).
 * The two axes live in separate tables; the effective rate is base + loading.
 */
export async function getRateGrid(): Promise<RateGridData> {
  if (!isSupabaseConfigured || isDemoMode()) return mockRateGridData;

  const [bandResult, categoryResult] = await Promise.all([
    supabase
      .from("rate_grid")
      .select("band_label, score_band_min, score_band_max, rate_pct, max_ltv_pct, max_foir_pct, max_tenure_months")
      .eq("is_active", true)
      .order("score_band_min", { ascending: false }),
    supabase
      .from("employer_category_pricing")
      .select("category_code, category_label, description, rate_loading_pct, max_ltv_pct, max_tenure_months, processing_fee_inr")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  // C2: show the error rather than the sample grid
  if (bandResult.error) throw new Error(bandResult.error.message || "Could not load the rate grid");
  if (categoryResult.error) throw new Error(categoryResult.error.message || "Could not load the employer categories");

  const bands = (bandResult.data ?? []).flatMap((row) => {
    const parsed = rateBandRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const r = parsed.data;
    return [
      {
        band: `${r.score_band_min} – ${r.score_band_max}`,
        label: r.band_label,
        baseRate: r.rate_pct,
        maxLtvPct: r.max_ltv_pct,
        maxFoirPct: r.max_foir_pct,
        maxTenureMonths: r.max_tenure_months,
      },
    ];
  });

  const categories = (categoryResult.data ?? []).flatMap((row) => {
    const parsed = employerCategoryRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const r = parsed.data;
    return [
      {
        code: r.category_code as EmployerCategoryPricing["code"],
        label: r.category_label,
        description: r.description,
        loadingPct: r.rate_loading_pct,
        maxLtvPct: r.max_ltv_pct,
        maxTenureMonths: r.max_tenure_months,
        processingFeeInr: r.processing_fee_inr,
      },
    ];
  });

  return { bands, categories };
}

/** Effective rate for a band under an employer category. 0 base = not offered. */
export function effectiveRate(band: RateBand, category: EmployerCategoryPricing): number | null {
  if (band.baseRate <= 0) return null;
  return Math.round((band.baseRate + category.loadingPct) * 100) / 100;
}

export type CustomerPii = { panNumber: string | null; mobile: string | null };

/**
 * Full PAN and mobile for one customer. Everywhere else in the app these arrive
 * masked (XXXXXX234F) because they are encrypted at rest — see
 * sql/012_pii_encryption.sql. The RPC checks the caller is an active officer
 * and writes a PII_REVEAL audit event, so only call it on a deliberate action.
 */
export async function revealCustomerPii(
  customerId: string,
  reason?: string,
): Promise<CustomerPii | null> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return { panNumber: "ABCPK1234F", mobile: "9840012345" };
  }

  const { data, error } = await supabase.rpc("fn_customer_pii", {
    p_customer_id: customerId,
    p_reason: reason ?? null,
  });

  if (error) {
    console.error("Failed to reveal customer PII:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    panNumber: row.pan_number ?? null,
    mobile: row.mobile ?? null,
  };
}

type AuditEntry = {
  time: string;
  user: string;
  action: string;
  app: string;
  details: string;
  ip: string;
};

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export interface RecommendationRecord {
  recommendation?: string;
  recommended_rate?: number;
  foir_calculated?: number;
  ltv_calculated?: number;
  risk_factors?: Array<{ message: string }>;
  summary_text?: string;
  policyVersionId?: string;
  rulesSnapshot?: string;
  modelVersion?: string;
  versionBasis?: "RECORDED" | "ASSUMED";
}

export type ApplicationFormData = {
  fullName: string;
  email: string;
  mobile: string;
  dob: string;
  pan: string;
  employer: string;
  city: string;
  stateCode: string;
  pincode: string;
  netSalary: number;
  existingEmis: number;
  loanAmount: number;
  tenure: number;
  make: string;
  model: string;
  variant: string;
  fuelType: string;
  exShowroom: number;
  onRoad: number;
  cibilScore: number;
};

export type SubmitResult = {
  applicationId: string;
  applicationUuid: string;
  decision: string;
  rate: number;
  summary: string;
};

/** What the case says after the pipeline, and the engine, have finished with it. */
async function latestDecision(applicationUuid: string): Promise<string | null> {
  const { data } = await supabase
    .from("recommendations")
    .select("recommendation")
    .eq("application_id", applicationUuid)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data as { recommendation?: string }[] | null)?.[0];
  return row?.recommendation ?? null;
}

export async function submitFullApplication(
  form: ApplicationFormData
): Promise<SubmitResult | null> {
  if (!isSupabaseConfigured || isDemoMode()) {
    await new Promise((r) => setTimeout(r, 800));
    const score = form.cibilScore || 750;
    const foirEst = form.existingEmis / (form.netSalary || 1) * 100;
    const decision = score >= 750 && foirEst < 50 ? "APPROVE" : score >= 650 ? "MAYBE" : "REJECT";
    const seq = String(Math.floor(Math.random() * 900) + 100);
    return {
      applicationId: `APP-2026-${seq.padStart(5, "0")}`,
      applicationUuid: "",
      decision,
      rate: decision === "APPROVE" ? 8.99 : decision === "MAYBE" ? 9.9 : 0,
      summary: decision === "APPROVE" ? "All policy checks passed" : decision === "MAYBE" ? "Officer review needed — FOIR marginal" : "Bureau score below threshold",
    };
  }

  const { data, error } = await supabase.rpc("fn_submit_full_application", {
    p_full_name: form.fullName,
    p_email: form.email,
    p_mobile: form.mobile,
    p_dob: form.dob || null,
    p_pan: form.pan,
    p_employer: form.employer,
    p_city: form.city,
    p_state_code: form.stateCode,
    p_pincode: form.pincode,
    p_net_salary: form.netSalary,
    p_existing_emis: form.existingEmis,
    p_loan_amount: form.loanAmount,
    p_tenure: form.tenure,
    p_make: form.make,
    p_model: form.model,
    p_variant: form.variant,
    p_fuel_type: form.fuelType || "PETROL",
    p_ex_showroom: form.exShowroom,
    p_on_road: form.onRoad,
    p_cibil_score: form.cibilScore,
  });

  if (error || !data) {
    console.error("Submit failed:", error);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  // With the server_engine switch on, the rules engine decides the case and
  // replaces the decision the database pipeline just made.
  await assessIfServerEngineOn(r.application_uuid);
  const decided = r.application_uuid ? await latestDecision(r.application_uuid) : null;
  return {
    applicationId: r.application_id ?? "",
    applicationUuid: r.application_uuid ?? "",
    decision: decided ?? r.decision ?? "UNKNOWN",
    rate: Number(r.rate) || 0,
    summary: r.summary ?? "",
  };
}

export type OfficerDecisionInput = {
  applicationId: string;
  decision: "APPROVE" | "REJECT" | "MAYBE";
  remarks?: string;
  reasonCodes?: string[];
  sanctionedAmount?: number;
  sanctionedRate?: number;
  sanctionedTenure?: number;
  overrideReason?: string;
};

export type OfficerDecisionResult = {
  applicationId: string;
  decision: string;
  status: string;
  isOverride: boolean;
  sanctionedAmount: number;
  sanctionedRate: number;
  sanctionedTenure: number;
  sanctionedEmi: number;
  message: string;
};

export async function submitOfficerDecision(
  input: OfficerDecisionInput
): Promise<OfficerDecisionResult | null> {
  if (!isSupabaseConfigured || isDemoMode()) {
    await new Promise((r) => setTimeout(r, 600));
    const emi = input.sanctionedAmount && input.sanctionedRate && input.sanctionedTenure
      ? Math.round(input.sanctionedAmount * (input.sanctionedRate / 1200) * Math.pow(1 + input.sanctionedRate / 1200, input.sanctionedTenure) / (Math.pow(1 + input.sanctionedRate / 1200, input.sanctionedTenure) - 1))
      : 0;
    return {
      applicationId: input.applicationId,
      decision: input.decision,
      status: input.decision === "APPROVE" ? "Approved" : input.decision === "REJECT" ? "Rejected" : "Referred",
      isOverride: false,
      sanctionedAmount: input.sanctionedAmount || 0,
      sanctionedRate: input.sanctionedRate || 0,
      sanctionedTenure: input.sanctionedTenure || 0,
      sanctionedEmi: emi,
      message: input.decision === "APPROVE" ? "Application approved" : input.decision === "REJECT" ? "Application rejected" : "Referred for review",
    };
  }

  const { data, error } = await supabase.rpc("fn_officer_decision", {
    p_application_id: input.applicationId,
    p_decision: input.decision,
    p_remarks: input.remarks || null,
    p_reason_codes: input.reasonCodes || null,
    p_sanctioned_amount: input.sanctionedAmount || null,
    p_sanctioned_rate: input.sanctionedRate || null,
    p_sanctioned_tenure: input.sanctionedTenure || null,
    p_override_reason: input.overrideReason || null,
  });

  if (error || !data) {
    console.error("Officer decision failed:", error);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  return {
    applicationId: r.application_id ?? "",
    decision: r.decision ?? "",
    status: r.status ?? "",
    isOverride: r.is_override ?? false,
    sanctionedAmount: Number(r.sanctioned_amount) || 0,
    sanctionedRate: Number(r.sanctioned_rate) || 0,
    sanctionedTenure: Number(r.sanctioned_tenure) || 0,
    sanctionedEmi: Number(r.sanctioned_emi) || 0,
    message: r.message ?? "",
  };
}

export type DashboardStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  stpRate: number;
  /** first-payment default, % of loans whose first instalment is 30+ days late; null with no loans old enough */
  fpdRisk: number | null;
  /** % change in sent applications against the equal period before; null for "all time" or nothing before */
  totalTrend: number | null;
  avgProcessingDays: number | null;
};

export type DashboardQueueItem = {
  id: string;
  name: string;
  status: string;
  since: string;
  origin: string | null;
  recommendation: "Approve" | "Maybe" | "Reject" | null;
};

export type DashboardException = {
  id: string;
  name: string;
  origin: string | null;
  dealer: string;
  loanAmount: number;
  engineScore: number | null;
  reason: string;
};

export type DashboardData = {
  stats: DashboardStats;
  synthetic: number;
  funnel: { stage: string; count: number }[];
  trend: DecisionTrendPoint[];
  fpdLoans: number;
  myQueue: DashboardQueueItem[];
  exceptions: DashboardException[];
  activity: { id: string; actor: string; eventType: string; applicationId: string | null; timestamp: string }[];
};

function sampleDashboard(): DashboardData {
  const trend: DecisionTrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    trend.push({ date: d.toISOString().slice(0, 10), approved: 8 + (i % 7), rejected: 1 + (i % 3), review: 3 + (i % 5) });
  }
  const sample = mockApplications.slice(0, 6);
  return {
    stats: { total: 1248, pending: 150, approved: 1028, rejected: 70, stpRate: 82.4, fpdRisk: 1.8, totalTrend: 12, avgProcessingDays: 1.8 },
    synthetic: 0,
    funnel: [
      { stage: "Submitted", count: 1248 },
      { stage: "Documents in", count: 1148 },
      { stage: "Bureau pulled", count: 1078 },
      { stage: "Approved", count: 1028 },
      { stage: "Disbursed", count: 966 },
    ],
    trend,
    fpdLoans: 628,
    myQueue: sample.slice(0, 3).map((a) => ({ id: a.id, name: a.name, status: a.status, since: a.submitted, origin: null, recommendation: a.recommendation })),
    exceptions: sample.map((a, i) => ({ id: a.id, name: a.name, origin: null, dealer: a.dealer.split(",")[0] ?? "", loanAmount: a.loanAmount,
      engineScore: [68, 42, 55, 71, 38, 62][i] ?? null, reason: a.flags[0] ?? "Income verification" })),
    activity: sample.slice(0, 5).map((a, i) => ({ id: `s${i}`, actor: i % 2 ? "System" : "Rajeev Menon", eventType: i % 2 ? "APPLICATION_ASSESSED" : "OFFICER_DECISION",
      applicationId: a.id, timestamp: new Date(Date.now() - (i + 1) * 40 * 60000).toISOString() })),
  };
}

/**
 * Every dashboard figure in one call: fn_staff_dashboard (sql/064). Signed-in
 * staff can't read the applications table, so the figures come from the
 * database function, with the same real-customer rule as the lists. Throws on
 * an error; the page shows it.
 */
export async function getDashboard(from?: string): Promise<DashboardData> {
  if (!isSupabaseConfigured || isDemoMode()) return sampleDashboard();

  const { data, error } = await supabase.rpc("fn_staff_dashboard", { p_from: from ?? null });
  if (error) throw new Error(error.message || "Could not load the dashboard");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  const t = d.totals ?? {};
  const decided = Number(t.decided) || 0;
  const total = Number(t.total) || 0;
  const prior = t.prior_total == null ? null : Number(t.prior_total);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tat = (d.tat ?? []) as any[];
  const tatCases = tat.reduce((sum, w) => sum + (Number(w.cases) || 0), 0);
  const tatHours = tat.reduce((sum, w) => sum + (Number(w.cases) || 0) * (Number(w.avg_hours) || 0), 0);
  const f = d.funnel ?? {};
  const rec = (r: string | null | undefined) => (r ? mapDecision(r) : null);

  return {
    stats: {
      total,
      pending: Number(t.pending) || 0,
      approved: Number(t.approved) || 0,
      rejected: Number(t.rejected) || 0,
      stpRate: decided > 0 ? Math.round((Number(t.straight_through) / decided) * 1000) / 10 : 0,
      fpdRisk: d.fpd?.pct == null ? null : Number(d.fpd.pct),
      totalTrend: prior && prior > 0 ? Math.round(((total - prior) / prior) * 100) : null,
      avgProcessingDays: tatCases > 0 ? Math.round((tatHours / tatCases / 24) * 10) / 10 : null,
    },
    synthetic: Number(t.synthetic) || 0,
    funnel: [
      { stage: "Submitted", count: Number(f.sent) || 0 },
      { stage: "Documents in", count: Number(f.documents) || 0 },
      { stage: "Bureau pulled", count: Number(f.bureau) || 0 },
      { stage: "Approved", count: Number(f.approved) || 0 },
      { stage: "Disbursed", count: Number(f.disbursed) || 0 },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trend: ((d.trend ?? []) as any[]).map((p) => ({ date: p.date, approved: p.approved, rejected: p.rejected, review: p.review })),
    fpdLoans: Number(d.fpd?.loans) || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    myQueue: ((d.my_queue ?? []) as any[]).map((q) => ({
      id: q.application_id, name: q.full_name ?? "", status: q.status, since: q.since, origin: q.origin ?? null, recommendation: rec(q.recommendation),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exceptions: ((d.exceptions ?? []) as any[]).map((x) => ({
      id: x.application_id, name: x.full_name ?? "", origin: x.origin ?? null, dealer: x.dealer_name ?? "",
      loanAmount: Number(x.loan_amount) || 0, engineScore: x.engine_score == null ? null : Number(x.engine_score), reason: x.reason ?? "",
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activity: ((d.activity ?? []) as any[]).map((e) => ({
      id: e.id, actor: e.actor ?? "System", eventType: e.event_type, applicationId: e.application_id ?? null, timestamp: e.created_at,
    })),
  };
}

export async function getDealersByOem() {
  if (!isSupabaseConfigured || isDemoMode()) {
    return Object.fromEntries(
      Object.entries(mockMakes || {}).map(([oem, dealers]) => [oem, dealers.map((name) => ({ dealer_name: name, dealer_code: "—", city: "—", state_code: "—", is_active: true }))])
    );
  }
  const { data, error } = await supabase
    .from("dealers")
    .select("oem_name, dealer_name, dealer_code, city, state_code, is_active")
    .eq("is_active", true)
    .order("oem_name")
    .order("dealer_name");
  if (error || !data) return {};
  const grouped: Record<string, Array<{ dealer_name: string; dealer_code: string; city: string; state_code: string; is_active: boolean }>> = {};
  for (const row of data as any[]) {
    const oem = row.oem_name as string;
    if (!grouped[oem]) grouped[oem] = [];
    grouped[oem].push({
      dealer_name: row.dealer_name,
      dealer_code: row.dealer_code ?? "—",
      city: row.city ?? "—",
      state_code: row.state_code ?? "—",
      is_active: row.is_active,
    });
  }
  return grouped;
}

export type Document = {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  url: string;
  status: "Uploaded" | "Extracted" | "Verified" | "Failed";
};

function mapDocStatus(raw: string | null | undefined): Document["status"] {
  const map: Record<string, Document["status"]> = {
    UPLOADED: "Uploaded",
    EXTRACTED: "Extracted",
    VERIFIED: "Verified",
    FAILED: "Failed",
  };
  return map[raw ?? ""] ?? "Uploaded";
}

export async function getDocuments(applicationId: string): Promise<Document[]> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase
    .from("documents")
    .select("id, doc_type, file_name, file_path, uploaded_at, created_at, upload_status")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error || !data) {
    console.error("Failed to fetch documents:", error);
    return [];
  }
  return (data as any[]).map((d: any) => ({
    id: d.id ?? "",
    type: d.doc_type ?? "OTHER",
    fileName: d.file_name ?? "Unknown",
    uploadedAt: formatDate(d.uploaded_at ?? d.created_at ?? ""),
    url: d.file_path ?? "",
    status: mapDocStatus(d.upload_status),
  }));
}

export async function uploadDocument(
  applicationId: string,
  file: File,
  docType: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 500));
  }
  const path = `${applicationId}/${docType}/${file.name}`;
  const { error } = await supabase.storage
    .from("documents")
    .upload(path, file, { upsert: true });
  if (error) return { error: error.message };
  await supabase.from("documents").insert({
    application_id: applicationId,
    doc_type: docType,
    file_name: file.name,
    file_size: file.size,
    storage_path: path,
  });
  return { error: null };
}

export type ApplicationNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

export async function getApplicationNotes(applicationId: string): Promise<ApplicationNote[]> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase
    .from("audit_events")
    .select("event_id, event_detail, actor_type, created_at")
    .eq("entity_type", "APPLICATION")
    .eq("entity_id", applicationId)
    .eq("event_type", "OFFICER_NOTE")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    id: row.event_id,
    text: (row.event_detail as any)?.note ?? "",
    author: row.actor_type === "SYSTEM" ? "System" : "Officer",
    createdAt: new Date(row.created_at).toLocaleString("en-IN"),
  }));
}

export async function addApplicationNote(applicationId: string, note: string): Promise<boolean> {
  if (!isSupabaseConfigured || isDemoMode()) return false;
  const { error } = await supabase.from("audit_events").insert({
    entity_type: "APPLICATION",
    entity_id: applicationId,
    event_type: "OFFICER_NOTE",
    actor_type: "USER",
    event_detail: { note },
  });
  return !error;
}

export async function getDocumentUrl(path: string): Promise<string> {
  if (!isSupabaseConfigured || isDemoMode() || !path) {
    return "https://placehold.co/600x800?text=Document+Preview";
  }
  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "https://placehold.co/600x800?text=Preview+Unavailable";
}

// -- Task 52: Assessment persistence --------------------------------------------

export type SavedAssessment = {
  id: string;
  decision: string;
  score: number;
  rate: number;
  timestamp: string;
};

export async function saveAssessment(
  applicationId: string,
  result: Record<string, unknown>,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 400));
  }
  const { error } = await supabase.from("assessments").insert({
    application_id: applicationId,
    result_json: result,
  });
  return { error: error?.message ?? null };
}

export async function getAssessmentHistory(
  applicationId: string,
): Promise<SavedAssessment[]> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase
    .from("assessments")
    .select("id, result_json, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    id: row.id,
    decision: (row.result_json as any)?.decision?.decision ?? "UNKNOWN",
    score: (row.result_json as any)?.bureau?.score ?? 0,
    rate: (row.result_json as any)?.decision?.suggestedRate ?? 0,
    timestamp: row.created_at,
  }));
}

// -- Task 53: Status transitions -------------------------------------------------

const reverseStatusMap: Record<string, string> = {
  New: "DRAFT",
  "Documents Uploaded": "DOCUMENTS_SUBMITTED",
  "Under Review": "UNDER_ASSESSMENT",
  Referred: "UNDER_REVIEW",
  Sanctioned: "APPROVED",
  Rejected: "REJECTED",
  ESCALATED: "ESCALATED",
  HOLD: "HOLD",
};

export async function transitionStatus(
  applicationId: string,
  newStatus: string,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 400));
  }
  const dbStatus = reverseStatusMap[newStatus] ?? newStatus;
  const { error } = await supabase
    .from("applications")
    .update({ status: dbStatus })
    .eq("application_id", applicationId);
  return { error: error?.message ?? null };
}

// -- Task 55: Assignment ---------------------------------------------------------

export async function assignApplication(
  applicationId: string,
  userId: string,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 400));
  }
  const { error } = await supabase
    .from("applications")
    .update({ assigned_officer_id: userId })
    .eq("application_id", applicationId);
  return { error: error?.message ?? null };
}

export async function getOfficerQueue(
  officerName: string,
): Promise<Application[]> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return mockApplications.filter((a) => a.assignedTo === officerName).slice(0, 10);
  }
  const { data, error } = await supabase.rpc("fn_list_applications");
  if (error || !data) return [];
  return (data as any[])
    .map(mapToApplication)
    .filter((a) => a.assignedTo === officerName)
    .slice(0, 10);
}

// -- Task 60: Duplicate check ----------------------------------------------------

export type DuplicateMatch = {
  applicationId: string;
  name: string;
  status: string;
  matchField: string;
};

export async function checkDuplicates(
  pan: string,
  mobile: string,
  currentApplicationId: string,
): Promise<DuplicateMatch[]> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return [];
  }
  // PAN and mobile reach the page masked, so the match is made in the database by blind index.
  void pan;
  void mobile;
  const r = await applicationReview(currentApplicationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (r.duplicates ?? []).map((row: any) => ({
    applicationId: row.application_id,
    name: row.full_name ?? "",
    status: row.status ?? "",
    matchField: row.match_field,
  }));
}

// -- Task 61: Override -----------------------------------------------------------

export type OverridePayload = {
  applicationId: string;
  originalDecision: string;
  overrideDecision: "APPROVE" | "REJECT" | "HOLD";
  reason: string;
  overriddenBy: string;
};

export async function submitOverride(
  payload: OverridePayload,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 500));
  }
  const { error } = await supabase.from("decision_overrides").insert({
    application_id: payload.applicationId,
    original_decision: payload.originalDecision,
    override_decision: payload.overrideDecision,
    reason: payload.reason,
    overridden_by: payload.overriddenBy,
  });
  if (error) return { error: error.message };
  await supabase
    .from("applications")
    .update({ status: payload.overrideDecision, is_overridden: true })
    .eq("application_id", payload.applicationId);
  return { error: null };
}

// -- Task 62: Escalation ---------------------------------------------------------

export type EscalationPayload = {
  applicationId: string;
  reason:
    | "HIGH_EXPOSURE"
    | "POLICY_EXCEPTION"
    | "FRAUD_SUSPICION"
    | "INCOMPLETE_DOCS"
    | "OTHER";
  notes: string;
  escalatedBy: string;
};

export async function escalateApplication(
  payload: EscalationPayload,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 500));
  }
  const { error } = await supabase.from("escalations").insert({
    application_id: payload.applicationId,
    reason: payload.reason,
    notes: payload.notes,
    escalated_by: payload.escalatedBy,
  });
  if (error) return { error: error.message };
  await supabase
    .from("applications")
    .update({ status: "ESCALATED" })
    .eq("application_id", payload.applicationId);
  return { error: null };
}

export async function getEscalationHistory(
  applicationId: string,
): Promise<
  { reason: string; notes: string; escalatedBy: string; createdAt: string }[]
> {
  if (!isSupabaseConfigured || isDemoMode()) return [];
  const { data, error } = await supabase
    .from("escalations")
    .select("reason, notes, escalated_by, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    reason: row.reason,
    notes: row.notes,
    escalatedBy: row.escalated_by,
    createdAt: row.created_at,
  }));
}

// -- Task 66: Employer verification ----------------------------------------------

export type EmployerVerification = {
  employerName: string;
  found: boolean;
  category: "CAT_A" | "CAT_B" | "CAT_C" | "UNVERIFIED";
  rateImpact: string;
};

export async function verifyEmployer(
  employerName: string,
): Promise<EmployerVerification> {
  if (!isSupabaseConfigured || isDemoMode()) {
    const knownEmployers: Record<string, "CAT_A" | "CAT_B" | "CAT_C"> = {
      Infosys: "CAT_A",
      TCS: "CAT_A",
      Wipro: "CAT_A",
      HCL: "CAT_A",
      Reliance: "CAT_A",
      "HDFC Bank": "CAT_A",
      SBI: "CAT_A",
      "Tech Mahindra": "CAT_B",
      Mindtree: "CAT_B",
      "L&T": "CAT_B",
    };
    const cat = knownEmployers[employerName];
    return {
      employerName,
      found: !!cat,
      category: cat ?? "UNVERIFIED",
      rateImpact:
        cat === "CAT_A"
          ? "Best rate eligible"
          : cat === "CAT_B"
            ? "Standard rate"
            : cat === "CAT_C"
              ? "Higher rate bracket"
              : "Manual verification required",
    };
  }
  // The Employer Master (sql/069): staff read it through fn_employer_list.
  const { data, error } = await supabase.rpc("fn_employer_list", { p_search: employerName, p_category: null });
  const match = error
    ? undefined
    : ((data as { rows?: { name: string; category: string; verified: boolean }[] })?.rows ?? []).find(
        (r) => r.name.toLowerCase() === employerName.trim().toLowerCase(),
      ) ?? ((data as { rows?: { name: string; category: string; verified: boolean }[] })?.rows ?? [])[0];
  if (!match) {
    return {
      employerName,
      found: false,
      category: "UNVERIFIED",
      rateImpact: "Manual verification required",
    };
  }
  const cat = `CAT_${match.category}` as EmployerVerification["category"];
  return {
    employerName,
    found: true,
    category: cat,
    rateImpact:
      cat === "CAT_A"
        ? "Best rate eligible"
        : cat === "CAT_B"
          ? "Standard rate"
          : "Higher rate bracket",
  };
}

// -- Task 67: Vehicle verification -----------------------------------------------

export type VehicleVerification = {
  make: string;
  model: string;
  variant: string;
  exShowroomVerified: number | null;
  priceDelta: number | null;
  dealerFound: boolean;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
};

export async function verifyVehicle(
  make: string,
  model: string,
  variant: string,
  declaredExShowroom: number,
): Promise<VehicleVerification> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return {
      make,
      model,
      variant,
      exShowroomVerified: declaredExShowroom,
      priceDelta: 0,
      dealerFound: true,
      riskTier: "LOW",
    };
  }
  const { data: dealer } = await supabase
    .from("dealers")
    .select("oem, risk_tier")
    .ilike("oem", make)
    .limit(1)
    .single();
  return {
    make,
    model,
    variant,
    exShowroomVerified: declaredExShowroom,
    priceDelta: 0,
    dealerFound: !!dealer,
    riskTier:
      (dealer?.risk_tier as VehicleVerification["riskTier"]) ?? "MEDIUM",
  };
}

// -- Task 68: Application timeline -----------------------------------------------

export type TimelineEvent = {
  stage: string;
  timestamp: string;
  actor: string;
  detail: string;
};

export async function getApplicationTimeline(
  applicationId: string,
): Promise<TimelineEvent[]> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return [
      {
        stage: "Created",
        timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
        actor: "System",
        detail: "Application submitted",
      },
      {
        stage: "Documents Uploaded",
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        actor: "Applicant",
        detail: "Salary slip, PAN uploaded",
      },
      {
        stage: "Bureau Check",
        timestamp: new Date(
          Date.now() - 86400000 * 2 + 3600000,
        ).toISOString(),
        actor: "System",
        detail: "CIBIL score: 745",
      },
      {
        stage: "Auto Assessment",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        actor: "System",
        detail: "Decision: Approve",
      },
      {
        stage: "Pending Review",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        actor: "System",
        detail: "Awaiting officer review",
      },
    ];
  }
  const r = await applicationReview(applicationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (r.timeline ?? []).map((row: any) => ({
    stage: row.event_type,
    timestamp: row.created_at,
    actor: row.actor ?? "System",
    detail: row.detail && Object.keys(row.detail).length ? JSON.stringify(row.detail) : "",
  }));
}

// -- Audit Log (sql/065, fix list C1 + G6) ---------------------------------------

export type AuditFilters = {
  from?: string | null;
  to?: string | null;
  actor?: string | null;
  activity?: string | null;
  caseId?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
};

export type AuditRow = {
  id: string;
  at: string;
  actorKey: string;
  actorName: string;
  actorRole: string | null;
  activity: string;
  caseId: string | null;
  synthetic: boolean;
  details: Record<string, unknown>;
};

export type AuditPage = {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditRow[];
  activities: string[];
  users: { key: string; name: string; role: string | null }[];
};

/**
 * One page of the combined audit log: case events, policy versions, switches,
 * case stages and overrides, newest first. Read through fn_audit_log; throws on
 * an error so the page can say so.
 */
export async function getAuditLog(f: AuditFilters = {}): Promise<AuditPage> {
  if (!isSupabaseConfigured || isDemoMode()) {
    const rows: AuditRow[] = mockAuditLog.map((e, i) => ({
      id: String(i),
      at: new Date(Date.now() - i * 3600000).toISOString(),
      actorKey: e.user === "System" ? "SYSTEM" : e.user,
      actorName: e.user,
      actorRole: null,
      activity: e.action.toUpperCase().replace(/ /g, "_"),
      caseId: e.app === "—" ? null : e.app,
      synthetic: false,
      details: { note: e.details },
    }));
    return { total: rows.length, page: 1, pageSize: rows.length, rows, activities: [...new Set(rows.map((r) => r.activity))],
      users: [...new Set(rows.map((r) => r.actorName))].map((n) => ({ key: n === "System" ? "SYSTEM" : n, name: n, role: null })) };
  }
  const { data, error } = await supabase.rpc("fn_audit_log", {
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_actor: f.actor ?? null,
    p_activity: f.activity ?? null,
    p_case: f.caseId ?? null,
    p_search: f.search ?? null,
    p_page: f.page ?? 1,
    p_page_size: f.pageSize ?? 50,
  });
  if (error) throw new Error(error.message || "Could not load the audit log");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return {
    total: Number(d.total) || 0,
    page: Number(d.page) || 1,
    pageSize: Number(d.page_size) || 50,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: ((d.rows ?? []) as any[]).map((r) => ({
      id: r.id, at: r.at, actorKey: r.actor_key, actorName: r.actor_name, actorRole: r.actor_role ?? null,
      activity: r.activity, caseId: r.case_id ?? null, synthetic: Boolean(r.synthetic), details: r.details ?? {},
    })),
    activities: (d.activities ?? []) as string[],
    users: ((d.users ?? []) as { key: string; name: string; role: string | null }[]),
  };
}

// -- Task 69: Decision trend -----------------------------------------------------

export type DecisionTrendPoint = {
  date: string;
  approved: number;
  rejected: number;
  review: number;
};

// -- Task 70: Portfolio metrics --------------------------------------------------

export type PortfolioMetrics = {
  /** false when this login may not see the book (officers see only their own cases) */
  available: boolean;
  message?: string;
  loans: number;
  principalLeft: number;
  loansOverdue: number;
  par30Pct: number | null;
  /** loans by days overdue today */
  buckets: { name: string; value: number; color: string }[];
};

const BUCKET_COLORS: Record<string, string> = {
  Current: "#22c55e",
  "1-30": "#eab308",
  "31-60": "#f97316",
  "61-90": "#ef4444",
  "90+": "#b91c1c",
};

const bucketColor = (name: string): string => BUCKET_COLORS[name] ?? "#94a3b8";

// The dashboard's "Portfolio quality" box: a summary of fn_staff_loan_portfolio (058).
// It used to average columns the applications table does not have, so it showed zeros live.
export async function getPortfolioMetrics(): Promise<PortfolioMetrics> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return {
      available: true,
      loans: 628,
      principalLeft: 482_000_000,
      loansOverdue: 9,
      par30Pct: 0.6,
      buckets: [
        { name: "Current", value: 619, color: bucketColor("Current") },
        { name: "1-30", value: 5, color: bucketColor("1-30") },
        { name: "31-60", value: 2, color: bucketColor("31-60") },
        { name: "61-90", value: 1, color: bucketColor("61-90") },
        { name: "90+", value: 1, color: bucketColor("90+") },
      ],
    };
  }
  const { data, error } = await supabase.rpc("fn_staff_loan_portfolio");
  if (error || !data) {
    return {
      available: false,
      message: /permission/i.test(error?.message ?? "")
        ? "The loan book is open to credit managers, credit heads, compliance and admins."
        : `The loan book could not be loaded: ${error?.message ?? "no answer"}`,
      loans: 0,
      principalLeft: 0,
      loansOverdue: 0,
      par30Pct: null,
      buckets: [],
    };
  }
  const book = data as {
    totals: { loans: number; principal_left: number; loans_overdue: number; par_30_pct: number | null };
    buckets: { bucket: string; loans: number }[];
  };
  return {
    available: true,
    loans: book.totals.loans,
    principalLeft: Number(book.totals.principal_left),
    loansOverdue: book.totals.loans_overdue,
    par30Pct: book.totals.par_30_pct,
    buckets: book.buckets.map((b) => ({ name: b.bucket, value: b.loans, color: bucketColor(b.bucket) })),
  };
}

// -- Task 71: Location hierarchy -------------------------------------------------

export type LocationNode = {
  state: string;
  cities: { city: string; branches: string[] }[];
};

export async function getLocationHierarchy(): Promise<LocationNode[]> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return [
      {
        state: "Tamil Nadu",
        cities: [
          {
            city: "Chennai",
            branches: ["Anna Nagar", "T. Nagar", "Adyar"],
          },
          {
            city: "Coimbatore",
            branches: ["RS Puram", "Gandhipuram"],
          },
        ],
      },
      {
        state: "Karnataka",
        cities: [
          {
            city: "Bengaluru",
            branches: ["Koramangala", "Whitefield", "Jayanagar"],
          },
          { city: "Mysuru", branches: ["Saraswathipuram"] },
        ],
      },
      {
        state: "Maharashtra",
        cities: [
          {
            city: "Mumbai",
            branches: ["Andheri", "Bandra", "Powai"],
          },
          { city: "Pune", branches: ["Kothrud", "Hinjewadi"] },
        ],
      },
      {
        state: "Delhi",
        cities: [
          {
            city: "New Delhi",
            branches: [
              "Connaught Place",
              "Nehru Place",
              "Karol Bagh",
            ],
          },
        ],
      },
    ];
  }
  const { data, error } = await supabase
    .from("branches")
    .select("state, city, branch_name")
    .order("state")
    .order("city")
    .order("branch_name");
  if (error || !data) return [];
  const map = new Map<string, Map<string, string[]>>();
  for (const row of data as any[]) {
    if (!map.has(row.state)) map.set(row.state, new Map());
    const cityMap = map.get(row.state)!;
    if (!cityMap.has(row.city)) cityMap.set(row.city, []);
    cityMap.get(row.city)!.push(row.branch_name);
  }
  return Array.from(map.entries()).map(([state, cityMap]) => ({
    state,
    cities: Array.from(cityMap.entries()).map(([city, branches]) => ({
      city,
      branches,
    })),
  }));
}

// -- Task 72: Employer search ----------------------------------------------------

export type EmployerSuggestion = {
  name: string;
  category: "CAT_A" | "CAT_B" | "CAT_C";
};

export async function searchEmployers(
  query: string,
): Promise<EmployerSuggestion[]> {
  if (!isSupabaseConfigured || isDemoMode()) {
    const all: EmployerSuggestion[] = [
      { name: "Infosys", category: "CAT_A" },
      { name: "TCS", category: "CAT_A" },
      { name: "Wipro", category: "CAT_A" },
      { name: "HCL Technologies", category: "CAT_A" },
      { name: "Reliance Industries", category: "CAT_A" },
      { name: "HDFC Bank", category: "CAT_A" },
      { name: "SBI", category: "CAT_A" },
      { name: "ICICI Bank", category: "CAT_A" },
      { name: "Tech Mahindra", category: "CAT_B" },
      { name: "Mindtree", category: "CAT_B" },
      { name: "L&T", category: "CAT_B" },
      { name: "Bajaj Finance", category: "CAT_B" },
      { name: "Axis Bank", category: "CAT_B" },
      { name: "Mphasis", category: "CAT_B" },
    ];
    const q = query.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  }
  const { data, error } = await supabase.rpc("fn_employer_list", { p_search: query, p_category: null });
  if (error || !data) return [];
  return ((data as { rows?: { name: string; category: string }[] }).rows ?? [])
    .slice(0, 8)
    .map((r) => ({ name: r.name, category: `CAT_${r.category}` })) as EmployerSuggestion[];
}

export async function getBankingAnalysis(applicationId: string, from?: string): Promise<{
  summary: BankStatementSummary | null;
  transactions: BankTransaction[];
}> {
  if (!isSupabaseConfigured || isDemoMode()) {
    return { summary: mockBankStatementSummary, transactions: mockTransactions };
  }
  void from;
  const b = (await applicationReview(applicationId)).bank;
  if (!b) return { summary: null, transactions: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txns = (b.transactions ?? []) as any[];
  const months = Number(b.months_covered) || 6;
  const summary: BankStatementSummary = {
    avgMonthlyBalance: Number(b.avg_monthly_balance) || 0,
    salaryCreditCount: txns.filter((t) => t.category === "Salary").length || (b.salary_regularity === "REGULAR" ? months : 0),
    avgSalaryAmount: Number(b.avg_salary_credit) || 0,
    emiDebitCount: txns.filter((t) => t.category === "EMI").length,
    emiDebitTotal: Number(b.total_emi_debits) || 0,
    cashDeposits: Number(b.cash_deposit_total_6m) || 0,
    chequeBounceInward: 0,
    chequeBounceOutward: Number(b.bounce_count_6m) || 0,
    minBalanceBreaches: 0,
    months,
  };
  const known = ["Salary", "EMI", "Rent", "ATM", "Transfer", "UPI"];
  const transactions: BankTransaction[] = txns.map((t) => {
    const amount = Number(t.amount) || 0;
    const debit = String(t.txn_type).toUpperCase().startsWith("D");
    return {
      date: formatDate(t.txn_date ?? ""),
      description: t.description ?? "",
      debit: debit ? amount : 0,
      credit: debit ? 0 : amount,
      balance: Number(t.balance_after) || 0,
      category: (known.includes(t.category) ? t.category : "Other") as BankTransaction["category"],
    };
  });
  return { summary, transactions };
}
