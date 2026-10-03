/**
 * Employer Master (sql/069, fix list G4 and C9). Every read and change goes
 * through database functions; the tables are closed to the browser. In sample
 * mode a few sample employers stand in, marked as such.
 */

import { isDemoMode } from "./auth";
import { isSupabaseConfigured, supabase } from "./supabase";

export type EmployerType =
  | "GOVERNMENT"
  | "PSU"
  | "LISTED"
  | "MNC"
  | "PUBLIC_LTD"
  | "PRIVATE_LTD"
  | "LLP"
  | "PARTNERSHIP"
  | "PROPRIETORSHIP"
  | "OTHER";

export const EMPLOYER_TYPES: { value: EmployerType; label: string }[] = [
  { value: "GOVERNMENT", label: "Government" },
  { value: "PSU", label: "PSU" },
  { value: "LISTED", label: "Listed company" },
  { value: "MNC", label: "MNC" },
  { value: "PUBLIC_LTD", label: "Public limited" },
  { value: "PRIVATE_LTD", label: "Private limited" },
  { value: "LLP", label: "LLP" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "PROPRIETORSHIP", label: "Proprietorship" },
  { value: "OTHER", label: "Other" },
];

export const typeLabel = (t: string) => EMPLOYER_TYPES.find((x) => x.value === t)?.label ?? t;

export type EmployerRow = {
  id: string;
  name: string;
  aliases: string[];
  employer_type: EmployerType;
  category: "A" | "B" | "C";
  verified: boolean;
  listed: boolean | null;
  cin: string | null;
  gstin: string | null;
  company_status: string;
  years_of_filings: number | null;
  industry: string | null;
  hq_city: string | null;
  caution: boolean;
  last_verified_at: string | null;
  last_verified_by: string | null;
  pending_change: boolean;
  cases: number;
  loans: number;
  late_loans: number;
};

export type EmployerList = {
  can_manage: boolean;
  provider: string;
  pending: number;
  rows: EmployerRow[];
  sample?: boolean;
};

export type EmployerCheck = {
  check: "CIN_MCA" | "GSTIN" | "LISTED" | "GOVT_PSU" | "CAUTION";
  result: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "INFO";
  detail: Record<string, unknown> & { note?: string };
  source: string;
  at: string;
  by: string | null;
};

export type CategoryChange = {
  id: string;
  from: string;
  to: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  requested_by: string | null;
  requested_by_me: boolean;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
};

export type EmployerDetail = {
  employer: EmployerRow & {
    incorporation_year: number | null;
    incorporated_on: string | null;
    email_domains: string[];
    hq_state: string | null;
    caution_reason: string | null;
    listed_symbol: string | null;
    last_verified_by_name: string | null;
    source: string;
  };
  rule_category: "A" | "B" | "C";
  checks: EmployerCheck[];
  changes: CategoryChange[];
};

export type EmployerInput = {
  name: string;
  employer_type: EmployerType;
  aliases: string[];
  cin: string;
  gstin: string;
  email_domains: string[];
  industry: string;
  hq_city: string;
  hq_state: string;
  incorporated_on: string;
  caution: boolean;
  caution_reason: string;
};

const sampleMode = () => !isSupabaseConfigured || isDemoMode();

const fail = (e: { message?: string } | null, fallback: string) => new Error(e?.message || fallback);

const SAMPLE: EmployerRow[] = [
  ["Infosys Ltd", "LISTED", "A"],
  ["Indian Railways", "GOVERNMENT", "A"],
  ["Kaveri Foods Pvt Ltd", "PRIVATE_LTD", "B"],
  ["Gupta Trading Co", "PROPRIETORSHIP", "C"],
].map(([name, type, cat], i) => ({
  id: `sample-${i}`,
  name: name as string,
  aliases: [],
  employer_type: type as EmployerType,
  category: cat as "A" | "B" | "C",
  verified: i < 2,
  listed: type === "LISTED",
  cin: null,
  gstin: null,
  company_status: "UNKNOWN",
  years_of_filings: null,
  industry: null,
  hq_city: null,
  caution: false,
  last_verified_at: null,
  last_verified_by: null,
  pending_change: false,
  cases: 0,
  loans: 0,
  late_loans: 0,
}));

export async function listEmployers(search?: string, category?: string): Promise<EmployerList> {
  if (sampleMode()) {
    const q = (search ?? "").toLowerCase();
    return {
      can_manage: false,
      provider: "SIMULATED",
      pending: 0,
      sample: true,
      rows: SAMPLE.filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!category || e.category === category)),
    };
  }
  const { data, error } = await supabase.rpc("fn_employer_list", {
    p_search: search?.trim() || null,
    p_category: category || null,
  });
  if (error) throw fail(error, "Could not load the employers");
  return data as EmployerList;
}

export async function getEmployer(id: string): Promise<EmployerDetail> {
  const { data, error } = await supabase.rpc("fn_employer_get", { p_id: id });
  if (error) throw fail(error, "Could not load the employer");
  return data as EmployerDetail;
}

export async function saveEmployer(id: string | null, input: EmployerInput): Promise<string> {
  const { data, error } = await supabase.rpc("fn_employer_save", { p_id: id, p: input });
  if (error) throw fail(error, "Could not save the employer");
  return data as string;
}

export async function runEmployerChecks(id: string): Promise<EmployerDetail> {
  const { data, error } = await supabase.rpc("fn_employer_run_checks", { p_id: id });
  if (error) throw fail(error, "Could not run the checks");
  return data as EmployerDetail;
}

export async function requestCategory(id: string, category: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("fn_employer_request_category", { p_id: id, p_category: category, p_reason: reason });
  if (error) throw fail(error, "Could not ask for the change");
}

export async function decideCategory(requestId: string, action: "APPROVE" | "REJECT" | "WITHDRAW", note?: string): Promise<EmployerDetail> {
  const { data, error } = await supabase.rpc("fn_employer_decide_category", {
    p_request: requestId,
    p_action: action,
    p_note: note ?? null,
  });
  if (error) throw fail(error, "Could not record the decision");
  return data as EmployerDetail;
}

export const CHECK_LABEL: Record<string, string> = {
  CIN_MCA: "Company number at MCA",
  GSTIN: "GSTIN",
  LISTED: "Listed on NSE/BSE",
  GOVT_PSU: "Government / PSU list",
  CAUTION: "Caution list",
  EMAIL_DOMAIN: "Official email domain",
  NAME_MATCH: "Payslip and Form 16 name",
};

// -- The officer's card (sql/070, C8) ------------------------------------------

export type CaseEmployer = {
  employer: {
    found: boolean;
    employer_id?: string;
    name?: string;
    category?: string;
    verified?: boolean;
    employer_type?: string;
    caution?: boolean;
    caution_reason?: string | null;
    names_seen?: string[];
    checks?: Record<string, { result: string; note: string }>;
  };
  declared_name: string | null;
  declared_type: string | null;
  category: "A" | "B" | "C" | null;
  basis: "MASTER_VERIFIED" | "MASTER_PROVISIONAL" | "DECLARED_TYPE" | null;
  pricing: {
    base_rate_pct: number;
    rate_loading_pct: number;
    rate_pct: number;
    processing_fee_inr: number | null;
    ltv_cap_pct: number | null;
    tenure_cap: number | null;
    assessed_at: string;
    rate_grid?: { version_no: number; effective_from: string } | null;
  } | null;
};

export async function getCaseEmployer(applicationId: string): Promise<CaseEmployer | null> {
  if (sampleMode()) return null;
  const { data, error } = await supabase.rpc("fn_staff_case_employer", { p_application_id: applicationId });
  if (error) throw fail(error, "Could not load the employer");
  return data as CaseEmployer;
}
