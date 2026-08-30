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
} from "./mock-data";
import type { Application, PolicyRule } from "./mock-data";

// Maps Supabase row shape to the Application type used in the UI.
// Supabase returns joined data from applications + customers + vehicles + bureau + recommendation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToApplication(row: any): Application {
  return {
    id: (row.application_id as string) ?? "",
    name: (row.full_name as string) ?? "",
    employer: (row.employer_name as string) ?? "",
    category: mapCategory(row.cibil_score as number),
    loanAmount: (row.loan_amount_requested as number) ?? 0,
    cibil: (row.cibil_score as number) ?? 0,
    status: mapStatus(row.status as string),
    submitted: formatDate(row.created_at as string),
    assignedTo: (row.officer_name as string) ?? "Unassigned",
    recommendation: mapDecision(row.decision as string),
    rate: (row.rate as number) ?? 0,
    tenure: (row.tenure_months as number) ?? 0,
    foir: (row.foir_pct as number) ?? 0,
    ltvExShowroom: (row.ltv_pct as number) ?? 0,
    ltvOnRoad: 0,
    netIncome: (row.declared_net_salary as number) ?? 0,
    age: (row.age_at_application as number) ?? 0,
    pan: (row.pan_number as string) ?? "",
    aadhaar: "",
    phone: (row.mobile as string) ?? "",
    email: (row.email as string) ?? "",
    city: (row.city as string) ?? "",
    state: (row.state_name as string) ?? "",
    address: "",
    residence: "",
    designation: "",
    totalExperience: "",
    currentTenure: "",
    salaryBank: "",
    vehicle: `${row.vehicle_make ?? ""} ${row.vehicle_model ?? ""} ${row.vehicle_variant ?? ""}`.trim(),
    dealer: (row.dealer_name as string) ?? "",
    exShowroom: (row.ex_showroom_price as number) ?? 0,
    onRoad: (row.on_road_price as number) ?? 0,
    obligations: [],
    flags: ((row.risk_factors as Array<{ message: string }>) ?? []).map(
      (f: { message: string }) => f.message
    ),
    reasons: [],
  };
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
      customers!inner(full_name, email, mobile, pan_number, age_at_application, employer_name, city, state_code),
      vehicles!fk_vehicles_app(make, model, variant, ex_showroom_price, on_road_price),
      bureau_reports(score),
      recommendations(recommendation, recommended_rate, foir_calculated, ltv_calculated, risk_factors, summary_text),
      credit_decisions(decision)
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

  return mapToApplication({
    ...data,
    full_name: cust?.full_name,
    email: cust?.email,
    mobile: cust?.mobile,
    pan_number: cust?.pan_number,
    age_at_application: cust?.age_at_application,
    employer_name: cust?.employer_name,
    city: cust?.city,
    state_name: cust?.state_code,
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

export async function getRateGrid() {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("rate_grid")
    .select("*")
    .order("score_band_min");

  if (error) {
    console.error("Failed to fetch rate grid:", error);
    return [];
  }
  return data ?? [];
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

  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data || data.length === 0) {
    console.error("Failed to fetch audit events:", error);
    return {
      log: mockAuditLog,
      actions: mockAuditActions,
      users: mockUsers,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log: AuditEntry[] = data.map((row: any) => {
    const detail = row.event_detail ?? {};
    return {
      time: formatDateTime(row.created_at),
      user: row.actor_type === "SYSTEM" ? "System" : "Unknown",
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
  if (!isSupabaseConfigured) return null;

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

export async function getEmployers() {
  if (!isSupabaseConfigured) return mockEmployers;

  const { data, error } = await supabase
    .from("dealers")
    .select("oem_name")
    .eq("is_active", true);

  if (error || !data) return mockEmployers;
  return mockEmployers;
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
