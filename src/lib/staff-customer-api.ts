import { supabase } from "./supabase";

// Staff side of customer applications (sql/047). The database checks the
// caller's permissions on every call; these wrappers only shape the data.

const API_BASE = import.meta.env["VITE_AWS_API_URL"] ?? "";

function message(error: { message?: string } | null): string {
  const m = (error?.message ?? "Something went wrong").replace(/^.*?ERROR:\s*/, "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export type FaceResult = "MATCH" | "REVIEW" | "MISMATCH" | "NO_FACE";

// How statuses and face-match results read on the staff screens.
export const STATUS_TEXT: Record<
  string,
  [string, "info" | "warning" | "success" | "destructive" | "muted" | "primary"]
> = {
  SUBMITTED: ["Documents to check", "info"],
  UNDER_ASSESSMENT: ["Credit check", "primary"],
  UNDER_REVIEW: ["Referred", "warning"],
  APPROVED: ["Approved", "success"],
  REJECTED: ["Not approved", "destructive"],
  WITHDRAWN: ["Withdrawn", "muted"],
  CANCELLED: ["Cancelled", "muted"],
};

export const FACE_TEXT: Record<
  FaceResult,
  [string, "success" | "warning" | "destructive" | "muted"]
> = {
  MATCH: ["Face match", "success"],
  REVIEW: ["Face: check", "warning"],
  MISMATCH: ["Face mismatch", "destructive"],
  NO_FACE: ["No face found", "muted"],
};

export interface QueueRow {
  application_id: string;
  full_name: string;
  status: string;
  approval_stage: "IN_PRINCIPLE" | "FINAL" | null;
  submitted_at: string;
  hours_waiting: number;
  vehicle: string | null;
  loan_amount: number | null;
  officer: string | null;
  docs_to_check: number;
  docs_with_customer: number;
  fields_edited: number;
  face: FaceResult | null;
}

export async function getCustomerQueue(
  scope: "OPEN" | "DONE" | "ALL",
): Promise<{ drafts: number; rows: QueueRow[]; restricted?: boolean }> {
  const { data, error } = await supabase.rpc("fn_staff_customer_queue", { p_scope: scope });
  if (error) throw new Error(message(error));
  return data as { drafts: number; rows: QueueRow[]; restricted?: boolean };
}

export interface CaseFile {
  side: "front" | "back" | "single";
  file_name: string;
  size: number;
  mime: string;
  key: string;
  backend: string;
  uploaded_at: string;
  was_locked: boolean;
  unlocked: boolean;
  masked: boolean;
}

export interface CaseDocument {
  doc_type: string;
  name: string;
  required: "ALWAYS" | "CONDITIONAL" | "OPTIONAL";
  status: "MISSING" | "RECEIVED" | "ACCEPTED" | "REUPLOAD" | "WAIVED" | "NOT_NEEDED";
  reason: string | null;
  sides: number;
  files: CaseFile[];
}

export interface CaseGroup {
  prefilled: Record<string, unknown>;
  confirmed: Record<string, unknown>;
  edited: string[];
  confirmed_at: string;
}

export interface CustomerCase {
  application: {
    application_id: string;
    status: string;
    approval_stage: "IN_PRINCIPLE" | "FINAL" | null;
    submitted_at: string | null;
    created_at: string;
    decided_at: string | null;
    declared_net_salary: number | null;
    quote_pending: boolean;
    officer: string | null;
    assigned_to_me: boolean;
  };
  customer: {
    full_name: string;
    email: string;
    mobile: string;
    mobile_check: "SMS" | "SIMULATED" | null;
    pan: string | null;
    dob: string | null;
    age: number | null;
    father_name: string | null;
    gender: string | null;
    marital_status: string | null;
    employer_name: string | null;
    employer_category: string | null;
    designation: string | null;
    date_of_joining: string | null;
  };
  addresses: {
    type: "PERMANENT" | "CURRENT" | "OFFICE";
    line1: string;
    line2: string | null;
    city: string;
    state_code: string | null;
    pincode: string;
    source: string;
    residence: string | null;
    owner_name: string | null;
    owner_mobile: string | null;
    years: number | null;
  }[];
  groups: Partial<Record<"PERSONAL" | "ADDRESS" | "EMPLOYMENT", CaseGroup>>;
  vehicle: Record<string, unknown> | null;
  documents: CaseDocument[];
  face: {
    doc_type: string;
    side: string;
    similarity: number | null;
    result: FaceResult;
    checked_at: string;
  }[];
  consents: { purpose: string; version: string; given_at: string }[];
  stages: { stage: string; note: string | null; at: string }[];
  history: {
    event: string;
    detail: Record<string, unknown>;
    actor: string;
    by: string | null;
    at: string;
  }[];
}

export async function getCustomerCase(applicationId: string): Promise<CustomerCase> {
  const { data, error } = await supabase.rpc("fn_staff_customer_case", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as CustomerCase;
}

export type CaseAction =
  | "ASSIGN_TO_ME"
  | "ACCEPT_DOC"
  | "REQUEST_DOC"
  | "DOCS_VERIFIED"
  | "DECIDE"
  | "MOVE_TO_FINAL"
  | "NOTE";

export async function caseAction(
  applicationId: string,
  action: CaseAction,
  p: Record<string, unknown> = {},
): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("fn_staff_customer_action", {
    p_application_id: applicationId,
    p_action: action,
    p,
  });
  if (error) throw new Error(message(error));
  return data as { status: string };
}

/** A link that opens one customer file for 5 minutes (staff only, aws presigned_url.document_url_handler). */
export async function fileLink(applicationId: string, key: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to open files");
  const res = await fetch(`${API_BASE}/document-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId, key }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "The file couldn't be opened");
  return body.url as string;
}

// --- Credit checks (sql/048) ------------------------------------------------

export interface CaseChecks {
  bureau: {
    bureau_name: string;
    score: number | null;
    active_accounts: number | null;
    total_outstanding: number | null;
    total_monthly_emi: number | null;
    dpd_max_12m: number | null;
    dpd_60_plus_flag: boolean | null;
    enquiry_count_90d: number | null;
    writeoff_count_5y: number | null;
    settled_count_5y: number | null;
    credit_utilization_pct: number | null;
    oldest_account_months: number | null;
    created_at: string;
  } | null;
  bank: {
    months_covered: number;
    avg_monthly_balance: number | null;
    avg_salary_credit: number | null;
    salary_regularity: string | null;
    bounce_count_6m: number | null;
  } | null;
  income: {
    declared_net_salary: number | null;
    salary_slip_salary: number | null;
    bank_credit_salary: number | null;
    form16_monthly_equiv: number | null;
    income_variance_pct: number | null;
    income_variance_flag: boolean;
    eligible_net_salary: number | null;
  } | null;
  recommendation: {
    recommendation: "APPROVE" | "MAYBE" | "REJECT";
    recommended_rate: number | null;
    recommended_amount: number | null;
    recommended_emi: number | null;
    foir_calculated: number | null;
    ltv_calculated: number | null;
    risk_factors: unknown;
    summary_text: string | null;
    generated_at: string;
  } | null;
  declared_existing_emis: number | null;
}

export async function getCaseChecks(applicationId: string): Promise<CaseChecks> {
  const { data, error } = await supabase.rpc("fn_staff_customer_checks", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as CaseChecks;
}

const num = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Gathers what the document readers found (staff read of the S3 results), then
 * runs the bureau pull and the assessment. Anything not found is sent empty.
 */
export async function runCreditChecks(applicationId: string): Promise<void> {
  let x: Record<string, Record<string, { value: unknown }>> = {};
  if (API_BASE) {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`${API_BASE}/extraction/${encodeURIComponent(applicationId)}`, {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    }).catch(() => null);
    if (res?.ok) x = ((await res.json()) as { extractions?: typeof x }).extractions ?? {};
  }
  const bank = x["bank_statement"];
  const read = {
    slip_net_salary: num(x["salary_slip"]?.["net_salary"]?.value),
    form16_annual: num(x["form16"]?.["gross_total_income"]?.value),
    bank: bank
      ? {
          months: num(bank["months_analyzed"]?.value),
          avg_monthly_balance: num(bank["avg_monthly_balance"]?.value),
          avg_salary: num(bank["avg_salary"]?.value),
          salary_count: num(bank["salary_count"]?.value) ?? 0,
          emi_total: num(bank["emi_total"]?.value) ?? 0,
          bounce_count: num(bank["bounce_count"]?.value) ?? 0,
        }
      : null,
  };
  const { error } = await supabase.rpc("fn_staff_customer_run_checks", {
    p_application_id: applicationId,
    p_read: read,
  });
  if (error) throw new Error(message(error));
}
