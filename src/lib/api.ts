import { supabase, isSupabaseConfigured } from "./supabase";
import {
  applications as mockApplications,
  policyRules as mockPolicyRules,
  policyTabs as mockPolicyTabs,
  auditLog as mockAuditLog,
  auditActions as mockAuditActions,
  users as mockUsers,
  employers as mockEmployers,
  makes as mockMakes,
  mockBureauReport,
  mockBankStatementSummary,
  mockTransactions,
} from "./mock-data";
import type { Application, PolicyRule, BureauReport, BankStatementSummary, BankTransaction } from "./mock-data";
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
}).transform((row) => ({
  id: row.application_id,
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
  flags: (row.risk_factors as Array<{ message: string }>).map((f) => f.message),
  reasons: [],
} as Application));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToApplication(row: Record<string, unknown>): Application {
  return applicationRowSchema.parse(row);
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


export async function getBureauReport(applicationId: string): Promise<BureauReport> {
  if (!isSupabaseConfigured) return mockBureauReport;

  const { data, error } = await supabase
    .from("bureau_reports")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error("Failed to fetch bureau report:", error);
    return mockBureauReport;
  }

  return {
    score: Number(data.score) || 0,
    activeAccounts: Number(data.active_accounts) || 0,
    closedAccounts: Number(data.closed_accounts) || 0,
    overdueAccounts: Number(data.overdue_accounts) || 0,
    totalOutstanding: Number(data.total_outstanding) || 0,
    totalExposure: Number(data.total_exposure) || 0,
    enquiries90Days: Number(data.enquiries_90_days) || 0,
    enquiries: data.enquiries ?? mockBureauReport.enquiries,
    oldestAccountMonths: Number(data.oldest_account_months) || 0,
    oldestAccountAge: String(data.oldest_account_age ?? "—"),
    writeoffs: Boolean(data.writeoffs),
    settlements: Boolean(data.settlements),
    suitsFiled: Boolean(data.suits_filed),
    dpdHistory: Array.isArray(data.dpd_history) ? data.dpd_history : mockBureauReport.dpdHistory,
  };
}

export async function getApplications(): Promise<Application[]> {
  if (!isSupabaseConfigured) return mockApplications;

  const { data, error } = await supabase.rpc("fn_list_applications");
  if (error || !data) {
    console.error("Failed to fetch applications:", error);
    return mockApplications;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(mapToApplication);
}

export async function getApplication(
  id: string
): Promise<Application | undefined> {
  if (!isSupabaseConfigured) {
    return mockApplications.find((a) => a.id === id);
  }

  const { data, error } = await supabase
    .from("applications")
    .select(
      `
      *,
      customers!inner(full_name, email, mobile, pan_number, age_at_application, employer_name, city, state_code, address_line1, address_line2, pincode, residence_type, designation, years_in_current_job, total_work_experience_years, salary_bank_name),
      vehicles!fk_vehicles_app(make, model, variant, ex_showroom_price, on_road_price),
      bureau_reports(score),
      recommendations(recommendation, recommended_rate, foir_calculated, ltv_calculated, risk_factors, summary_text),
      credit_decisions(decision),
      obligations(lender_name, loan_type, emi_amount, outstanding_balance, dpd_current, source)
    `
    )
    .eq("application_id", id)
    .single();

  if (error || !data) {
    console.error("Failed to fetch application:", error);
    return mockApplications.find((a) => a.id === id);
  }

  const cust = data.customers;
  const veh = data.vehicles?.[0];
  const bureau = data.bureau_reports?.[0];
  const rec = data.recommendations?.[0];

  const baseApp = mapToApplication({
    ...data,
    full_name: cust?.full_name,
    email: cust?.email,
    mobile: cust?.mobile,
    pan_number: cust?.pan_number,
    age_at_application: cust?.age_at_application,
    employer_name: cust?.employer_name,
    city: cust?.city,
    state_name: cust?.state_code,
    address_line1: cust?.address_line1,
    address_line2: cust?.address_line2,
    pincode: cust?.pincode,
    residence_type: cust?.residence_type,
    designation: cust?.designation,
    years_in_current_job: cust?.years_in_current_job,
    total_work_experience_years: cust?.total_work_experience_years,
    salary_bank_name: cust?.salary_bank_name,
    vehicle_make: veh?.make,
    vehicle_model: veh?.model,
    vehicle_variant: veh?.variant,
    ex_showroom_price: veh?.ex_showroom_price,
    on_road_price: veh?.on_road_price,
    decision: rec?.recommendation,
    rate: rec?.recommended_rate,
    foir_pct: rec?.foir_calculated,
    ltv_pct: rec?.ltv_calculated,
    risk_factors: rec?.risk_factors,
    cibil_score: bureau?.score ?? 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obligations = ((data as any).obligations ?? []).map((o: any) => ({
    lender: o.lender_name ?? "",
    type: o.loan_type ?? "",
    emi: Number(o.emi_amount) || 0,
    outstanding: Number(o.outstanding_balance) || 0,
    dpd: String(o.dpd_current ?? "0"),
    source: o.source ?? "Bureau",
  }));

  return {
    ...baseApp,
    obligations: obligations.length > 0 ? obligations : baseApp.obligations,
  };
}

export async function createApplication(
  fullName: string,
  email: string,
  mobile: string
): Promise<{ applicationId: string; applicationUuid: string } | null> {
  if (!isSupabaseConfigured) return null;

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
  if (!isSupabaseConfigured) return null;

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

export async function getMappedPolicyRules(): Promise<{
  rules: Record<string, PolicyRule[]>;
  tabs: string[];
}> {
  if (!isSupabaseConfigured) {
    return { rules: mockPolicyRules, tabs: mockPolicyTabs };
  }

  const { data, error } = await supabase
    .from("policy_rules")
    .select("*")
    .order("display_order");

  if (error || !data || data.length === 0) {
    console.error("Failed to fetch policy rules:", error);
    return { rules: mockPolicyRules, tabs: mockPolicyTabs };
  }

  const grouped: Record<string, PolicyRule[]> = {};
  for (const row of data) {
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
  }

  return { rules: grouped, tabs: Object.keys(grouped) };
}

export async function togglePolicyRule(ruleId: string, isActive: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabase
    .from("policy_rules")
    .update({ is_active: isActive })
    .eq("rule_id", ruleId);
  return !error;
}

export async function getRateGrid() {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("rate_grid")
    .select("band_label, score_band_min, score_band_max, rate_pct")
    .order("score_band_min");

  if (error) {
    console.error("Failed to fetch rate grid:", error);
    return [];
  }
  if (!data || data.length === 0) return [];

  const transformed = (data as any[])
    .filter((row) => row.rate_pct && row.rate_pct > 0)
    .map((row) => ({
      band: row.band_label ?? `${row.score_band_min}-${row.score_band_max}`,
      catA: Number(row.rate_pct),
      catB: Math.round((Number(row.rate_pct) + 0.40) * 100) / 100,
      catC: Math.round((Number(row.rate_pct) + 1.25) * 100) / 100,
    }));

  // Fallback to mock if no valid rows
  return transformed.length > 0 ? transformed : [];
}

type AuditEntry = {
  time: string;
  user: string;
  action: string;
  app: string;
  details: string;
  ip: string;
};

export async function getMappedAuditLog(): Promise<{
  log: AuditEntry[];
  actions: string[];
  users: typeof mockUsers;
}> {
  if (!isSupabaseConfigured) {
    return {
      log: mockAuditLog,
      actions: mockAuditActions,
      users: mockUsers,
    };
  }

  const [eventsRes, usersRes] = await Promise.all([
    supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("users").select("id, full_name"),
  ]);

  if (eventsRes.error || !eventsRes.data || eventsRes.data.length === 0) {
    console.error("Failed to fetch audit events:", eventsRes.error);
    return {
      log: mockAuditLog,
      actions: mockAuditActions,
      users: mockUsers,
    };
  }

  const userMap = new Map<string, string>();
  (usersRes.data ?? []).forEach((u: { id: string; full_name: string }) => {
    userMap.set(u.id, u.full_name);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log: AuditEntry[] = eventsRes.data.map((row: any) => {
    const detail = row.event_detail ?? {};
    return {
      time: formatDateTime(row.created_at),
      user: row.actor_type === "SYSTEM" ? "System" : (userMap.get(row.actor_id) ?? "Unknown"),
      action: row.event_type?.replace(/_/g, " ") ?? "",
      app: detail.application_id
        ? String(detail.application_id)
        : "—",
      details: detail.message
        ? String(detail.message)
        : JSON.stringify(detail),
      ip: row.ip_address ?? "—",
    };
  });

  const actions = [...new Set(log.map((e) => e.action))];

  return { log, actions, users: mockUsers };
}

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
  decision: string;
  rate: number;
  summary: string;
};

export async function submitFullApplication(
  form: ApplicationFormData
): Promise<SubmitResult | null> {
  if (!isSupabaseConfigured) {
    await new Promise((r) => setTimeout(r, 800));
    const score = form.cibilScore || 750;
    const foirEst = form.existingEmis / (form.netSalary || 1) * 100;
    const decision = score >= 750 && foirEst < 50 ? "APPROVE" : score >= 650 ? "MAYBE" : "REJECT";
    const seq = String(Math.floor(Math.random() * 900) + 100);
    return {
      applicationId: `APP-2026-${seq.padStart(5, "0")}`,
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
  return {
    applicationId: r.application_id ?? "",
    decision: r.decision ?? "UNKNOWN",
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
  if (!isSupabaseConfigured) {
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
  fpdRisk: number;
  totalTrend: number;
};

export async function getDashboardStats(from?: string): Promise<DashboardStats> {
  if (!isSupabaseConfigured) {
    return { total: 1248, pending: 150, approved: 1028, rejected: 70, stpRate: 82.4, fpdRisk: 1.8, totalTrend: 12 };
  }

  let query = supabase.from("applications").select("status");
  if (from) query = query.gte("created_at", from);
  const { data, error } = await query;

  if (error || !data) {
    console.error("Failed to fetch stats:", error);
    return { total: 0, pending: 0, approved: 0, rejected: 0, stpRate: 0, fpdRisk: 0, totalTrend: 0 };
  }

  const total = data.length;
  const approved = data.filter((r) => r.status === "APPROVED").length;
  const rejected = data.filter((r) => r.status === "REJECTED").length;
  const pending = total - approved - rejected;
  const stpRate = total > 0 ? Math.round((approved / total) * 1000) / 10 : 0;

  return { total, pending, approved, rejected, stpRate, fpdRisk: 1.8, totalTrend: 12 };
}

export async function getDashboardTat(from?: string) {
  if (!isSupabaseConfigured) {
    const { tatData } = await import("./mock-data");
    return tatData;
  }

  let query = supabase
    .from("applications")
    .select("created_at, updated_at, status")
    .in("status", ["APPROVED", "REJECTED"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (from) query = query.gte("created_at", from);
  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    const { tatData } = await import("./mock-data");
    return tatData;
  }

  // Group by ISO week
  const weekMap: Record<string, { sum: number; count: number }> = {};
  for (const app of data as any[]) {
    const created = new Date(app.created_at);
    const updated = new Date(app.updated_at);
    const tatMinutes = (updated.getTime() - created.getTime()) / 60000;

    // ISO week label (e.g., "W35")
    const weekNum = Math.ceil(((created.getTime() - new Date(created.getFullYear(), 0, 1).getTime()) / 86400000 + created.getDay() + 1) / 7);
    const weekLabel = `W${weekNum}`;

    if (!weekMap[weekLabel]) weekMap[weekLabel] = { sum: 0, count: 0 };
    weekMap[weekLabel].sum += tatMinutes;
    weekMap[weekLabel].count += 1;
  }

  // Sort weeks and take last 4
  const result = Object.entries(weekMap)
    .sort(([a], [b]) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
    .slice(-4)
    .map(([week, v]) => ({ week, minutes: Math.round(v.sum / v.count) }));

  return result.length > 0 ? result : (await import("./mock-data")).tatData;
}


export async function getEmployers() {
  if (!isSupabaseConfigured) return mockEmployers;

  const { data, error } = await supabase
    .from("dealers")
    .select("oem_name, dealer_name, dealer_code, city, state_code, is_active")
    .eq("is_active", true);

  if (error || !data) return mockEmployers;
  // Transform dealer rows into employer records for UI
  return (data as any[]).map((d) => ({
    name: d.oem_name ?? d.dealer_name,
    category: "B", // default category — can be enhanced with category mapping from policy rules
    sector: d.city,
    listed: d.is_active ? "Active" : "Inactive",
    employees: "—",
    approved: 0,
    updated: new Date().toLocaleDateString("en-GB"),
  }));
}

export async function getDealersByOem() {
  if (!isSupabaseConfigured) {
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

export async function getMakes(): Promise<Record<string, string[]>> {
  if (!isSupabaseConfigured) return mockMakes;

  const { data, error } = await supabase
    .from("dealers")
    .select("oem_name, dealer_name")
    .eq("is_active", true);

  if (error || !data) return mockMakes;
  return mockMakes;
}

export async function getUsers() {
  if (!isSupabaseConfigured) return mockUsers;

  const { data, error } = await supabase
    .from("users")
    .select("full_name, email, role, approval_limit, branch_code, is_active")
    .order("full_name");

  if (error || !data) return mockUsers;

  const { inr } = await import("./format");

  return (data as any[]).map((u) => ({
    name: u.full_name ?? "",
    email: u.email ?? "",
    role: u.role === "CREDIT_OFFICER" ? "Credit Officer"
      : u.role === "STATE_HEAD" ? "State Credit Head"
      : u.role === "ADMIN" ? "Admin"
      : u.role,
    limit: inr(u.approval_limit ?? 0),
    branch: u.branch_code ?? "All branches",
    status: u.is_active ? "Active" : "Inactive",
  }));
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
  if (!isSupabaseConfigured) return [];
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
  if (!isSupabaseConfigured) {
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
  if (!isSupabaseConfigured) return [];
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
  if (!isSupabaseConfigured) return false;
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
  if (!isSupabaseConfigured || !path) {
    return "https://placehold.co/600x800?text=Document+Preview";
  }
  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "https://placehold.co/600x800?text=Preview+Unavailable";
}

export async function getBankingAnalysis(applicationId: string, from?: string): Promise<{
  summary: BankStatementSummary;
  transactions: BankTransaction[];
}> {
  if (!isSupabaseConfigured) {
    return { summary: mockBankStatementSummary, transactions: mockTransactions };
  }
  const [summaryRes, txnRes] = await Promise.all([
    supabase
      .from("bank_statement_analysis")
      .select("*")
      .eq("application_id", applicationId)
      .single(),
    supabase
      .from("bank_transactions")
      .select("*")
      .eq("application_id", applicationId)
      .order("transaction_date", { ascending: true }),
  ]);
  const summary: BankStatementSummary = summaryRes.data
    ? {
        avgMonthlyBalance: Number(summaryRes.data.avg_monthly_balance) || 0,
        salaryCreditCount: Number(summaryRes.data.salary_credit_count) || 0,
        avgSalaryAmount: Number(summaryRes.data.avg_salary_amount) || 0,
        emiDebitCount: Number(summaryRes.data.emi_debit_count) || 0,
        emiDebitTotal: Number(summaryRes.data.emi_debit_total) || 0,
        cashDeposits: Number(summaryRes.data.cash_deposits) || 0,
        chequeBounceInward: Number(summaryRes.data.cheque_bounce_inward) || 0,
        chequeBounceOutward: Number(summaryRes.data.cheque_bounce_outward) || 0,
        minBalanceBreaches: Number(summaryRes.data.min_balance_breaches) || 0,
        months: Number(summaryRes.data.months) || 6,
      }
    : mockBankStatementSummary;
  const transactions: BankTransaction[] = txnRes.data
    ? (txnRes.data as any[]).map((t) => ({
        date: formatDate(t.transaction_date ?? ""),
        description: t.description ?? "",
        debit: Number(t.debit) || 0,
        credit: Number(t.credit) || 0,
        balance: Number(t.balance) || 0,
        category: (t.category ?? "Other") as BankTransaction["category"],
      }))
    : mockTransactions;
  return { summary, transactions };
}
