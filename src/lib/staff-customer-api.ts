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
  // What the automatic document checks did (sql/052).
  fast_lane: boolean;
  auto_verified: boolean;
  docs_auto_accepted: number;
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
    /** Set for two-bureau (053) pulls, where total_monthly_emi is the monthly obligation. */
    bureau_count?: number | null;
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

// --- Credit bureau detail: two bureaus side by side (sql/053) -------------------

export type BureauCode = "CIBIL" | "EXPERIAN" | "CRIF" | "EQUIFAX";

export type BureauProduct =
  | "AUTO"
  | "HOME"
  | "PROPERTY"
  | "PERSONAL"
  | "CONSUMER"
  | "EDUCATION"
  | "TWO_WHEELER"
  | "GOLD"
  | "CARD"
  | "CORP_CARD"
  | "OVERDRAFT"
  | "OTHER";

/** The bureau_reports row the engine reads. For a 053 pull it holds the COMBINED figures. */
export interface BureauEngineRow {
  bureau_name: string;
  score: number | null;
  score_date: string | null;
  active_accounts: number | null;
  total_outstanding: number | null;
  /** For a 053 pull: COMBINED.monthly_obligation (EMIs + 5% of cards and overdrafts). */
  total_monthly_emi: number | null;
  dpd_max_12m: number | null;
  dpd_max_24m: number | null;
  dpd_30_count_24m: number | null;
  dpd_60_plus_flag: boolean | null;
  enquiry_count_90d: number | null;
  writeoff_count_5y: number | null;
  settled_count_5y: number | null;
  credit_utilization_pct: number | null;
  oldest_account_months: number | null;
  report_raw_path: string | null;
  extracted_at: string | null;
  created_at: string;
  // New in 053; null on older rows.
  report_ref: string | null;
  pulled_at: string | null;
  valid_until: string | null;
  consent_id: string | null;
  no_hit: boolean | null;
  score_source: BureauCode | null;
  bureau_count: number | null;
}

/**
 * One bureau's figures, or the COMBINED worst-of row. On a bureau with no record
 * (no_hit) every measure is null.
 */
export interface BureauSummary {
  bureau: BureauCode | "COMBINED";
  report_ref: string | null;
  pulled_at: string | null;
  valid_until: string | null;
  consent_id: string | null;
  raw_key: string | null;
  /** Month of dpd[0], 'YYYY-MM-01'. */
  grid_month: string | null;
  no_hit: boolean;
  score: number | null;
  score_source: BureauCode | null;
  bureau_count: number | null;
  /** COMBINED only, when both bureaus have a record. */
  score_gap: number | null;
  score_gap_flag: boolean | null;
  active_loans: number | null;
  active_cards: number | null;
  active_overdrafts: number | null;
  /** Loans + personal cards + overdrafts. */
  active_accounts: number | null;
  closed_accounts: number | null;
  /** Shown, not counted. */
  corporate_cards: number | null;
  /** Guarantor + authorised-user accounts; not counted. */
  guarantor_accounts: number | null;
  loan_balance: number | null;
  loan_sanctioned: number | null;
  card_balance: number | null;
  card_limit: number | null;
  credit_utilization_pct: number | null;
  total_outstanding: number | null;
  overdue_amount: number | null;
  instalment_emi: number | null;
  /** 5% of counted card and overdraft balances. */
  revolving_obligation: number | null;
  monthly_obligation: number | null;
  /** Whether revolving_obligation was inside monthly_obligation when this row was worked out. */
  revolving_counted: boolean;
  /** Display only; those EMIs are still counted. */
  emi_ending_3m: number | null;
  dpd_max_3m: number | null;
  dpd_max_6m: number | null;
  dpd_max_12m: number | null;
  dpd_max_24m: number | null;
  dpd_max_36m: number | null;
  dpd_30_count_24m: number | null;
  dpd_60_plus_flag: boolean | null;
  minor_dpd_months_7to12: number | null;
  on_time_pct_24m: number | null;
  sma0_count: number | null;
  sma1_count: number | null;
  sma2_count: number | null;
  sub_count: number | null;
  dbt_count: number | null;
  lss_count: number | null;
  secured_count: number | null;
  unsecured_count: number | null;
  secured_balance: number | null;
  unsecured_balance: number | null;
  opened_6m: number | null;
  opened_12m: number | null;
  restructured_count: number | null;
  writeoff_count_5y: number | null;
  settled_count_5y: number | null;
  suit_count: number | null;
  stale_lender_accounts: number | null;
  enquiry_count_30d: number | null;
  enquiry_count_90d: number | null;
  enquiry_count_12m: number | null;
  unsecured_enquiry_90d: number | null;
  auto_enquiry_30d: number | null;
  oldest_account_months: number | null;
  one_bureau_accounts: number | null;
  computed_at: string;
}

/** One bureau's copy of an account. The same loan on both bureaus shares merged_seq. */
export interface BureauAccount {
  bureau: BureauCode;
  seq: number;
  merged_seq: number | null;
  /** As the bureau prints it. */
  lender_raw: string;
  /** Starts with '~' when the name is not in lender_aliases. */
  lender_code: string;
  product_raw: string;
  product: BureauProduct;
  secured: boolean;
  revolving: boolean;
  corporate: boolean;
  account_masked: string | null;
  ownership: "INDIVIDUAL" | "JOINT" | "GUARANTOR" | "AUTHORISED";
  status: "ACTIVE" | "CLOSED" | "WRITTEN_OFF" | "SETTLED";
  asset_class: "STD" | "SMA0" | "SMA1" | "SMA2" | "SUB" | "DBT" | "LSS";
  restructured: boolean;
  suit_filed: boolean;
  sanctioned: number | null;
  credit_limit: number | null;
  cash_limit: number | null;
  outstanding: number;
  overdue: number;
  /** In the account's own frequency. */
  emi: number | null;
  frequency: "M" | "B" | "Q" | "H" | "Y" | "F" | "W";
  rate_pct: number | null;
  tenure_months: number | null;
  collateral: string | null;
  collateral_value: number | null;
  opened_on: string;
  last_payment_on: string | null;
  last_payment_amount: number | null;
  closed_on: string | null;
  reported_on: string;
  writeoff_amount: number | null;
  settled_amount: number | null;
  /** Month of dpd[0], 'YYYY-MM-01'. */
  grid_month: string;
  /** Days late, 24 months, newest first; -1 = not reported. */
  dpd: number[];
  /** Worst in the 12 months before the grid; -1 = none reported. */
  dpd_max_25_36m: number;
  // Worked out by the reader.
  lender_name: string;
  licence_cancelled: boolean;
  /** Null for cards and overdrafts. */
  monthly_emi: number | null;
  counted_in_obligation: boolean;
  /** The monthly EMI, or 5% of the balance for a counted card or overdraft; 0 when not counted. */
  obligation: number;
  /** An open loan with no EMI on this bureau's copy: it adds 0 to the obligation. */
  emi_not_reported: boolean;
}

export interface BureauEnquiry {
  bureau: BureauCode;
  seq: number;
  enquired_on: string;
  lender_raw: string;
  lender_code: string;
  purpose: BureauProduct;
  purpose_raw: string | null;
  amount: number | null;
  lender_name: string;
  also_on_other_bureau: boolean;
}

export interface BureauDifference {
  code:
    "NO_RECORD_ONE_BUREAU" | "SCORE_GAP" | "ACCOUNT_ONE_BUREAU" | "STATUS_DIFFERS" | "DPD_DIFFERS";
  text: string;
  bureau: BureauCode | null;
  merged_seq: number | null;
  /** SCORE_GAP {gap}; ACCOUNT_ONE_BUREAU {lender, product}; STATUS_DIFFERS / DPD_DIFFERS {<BUREAU>: value}. */
  detail: Record<string, string | number> | null;
}

/** Display only; never engine rules. */
export interface BureauFlag {
  code:
    | "NO_HIT_BOTH"
    | "SCORE_FROM_SECOND_BUREAU"
    | "LICENCE_CANCELLED_LENDER"
    | "RESTRUCTURED"
    | "OVERDUE"
    | "AUTO_ENQUIRY_30D"
    | "CREDIT_HUNGRY"
    | "THIN_FILE"
    | "EMI_NOT_REPORTED";
  text: string;
}

/** The policy switches the figures were worked out under. */
export interface BureauRules {
  sim_version: string;
  score_rule: string;
  score_gap_flag_points: number;
  revolving_rate: number;
  revolving_in_foir: boolean;
  guarantor_counted: boolean;
  corporate_cards_counted: boolean;
  emi_ending_3m_in_foir: boolean;
  licence_cancelled_marks_count: boolean;
  no_hit_both: string;
}

export interface BureauDetail {
  /** True only when a two-bureau (053) pull exists; older cases are false with empty lists. */
  detail: boolean;
  engine: BureauEngineRow | null;
  /** CIBIL, then the other bureau, then COMBINED last. */
  summaries: BureauSummary[];
  /** Ordered by merged_seq, CIBIL copy first. */
  accounts: BureauAccount[];
  /** Newest first. */
  enquiries: BureauEnquiry[];
  differences: BureauDifference[];
  flags: BureauFlag[];
  rules: BureauRules;
}

/** Both bureaus, the combined figures, accounts and enquiries for one application. */
export async function getBureauDetail(applicationId: string): Promise<BureauDetail> {
  const { data, error } = await supabase.rpc("fn_staff_bureau_detail", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as BureauDetail;
}

// --- Income and bank detail (sql/054) ------------------------------------------

export interface IncomeSlip {
  pay_month: string;
  employer_name: string | null;
  gross: number;
  basic: number | null;
  pf: number;
  professional_tax: number;
  tds: number;
  esi: number;
  employer_loan_recovery: number;
  other_deductions: number;
  net: number;
  lop_days: number;
  arrears: number;
  source: "READER" | "SIMULATED" | "STAFF";
}

export interface IncomeForm16 {
  assessment_year: string;
  employer_name: string | null;
  employer_tan: string | null;
  income_under_salaries: number | null;
  house_property_income: number;
  deduction_80e: number;
  gross_total_income: number;
  taxable_income: number | null;
  net_tax: number | null;
  signature_valid: boolean | null;
  source: string;
}

export interface IncomeBankMonth {
  month: string;
  salary_credit: number;
  salary_day: number | null;
  emi_debits: number;
  emi_debit_count: number;
  bounces: number;
  avg_balance: number | null;
  min_balance_breaches: number;
  cash_deposits: number;
  closing_balance: number | null;
  source: string;
}

export interface IncomeSummary {
  slip_months?: number;
  slip_net_salary?: number;
  slip_net_spread_pct?: number;
  slips_consecutive?: boolean;
  employer_loan_recovery?: number;
  form16_annual?: number;
  form16_monthly?: number;
  form16_ay?: string;
  house_property_loss?: number;
  bank?: {
    months: number;
    avg_monthly_balance?: number;
    avg_salary?: number;
    salary_count: number;
    emi_total: number;
    bounce_count: number;
    salary_day_spread?: number;
    min_balance_breaches: number;
  };
}

export interface IncomeFlag {
  code: string;
  severity: "info" | "warning" | "danger";
  text: string;
}

export interface IncomeDetail {
  detail: boolean;
  summary?: IncomeSummary;
  slips?: IncomeSlip[];
  form16?: IncomeForm16 | null;
  bank_months?: IncomeBankMonth[];
  flags?: IncomeFlag[];
}

export async function getIncomeDetail(applicationId: string): Promise<IncomeDetail> {
  const { data, error } = await supabase.rpc("fn_staff_income_detail", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as IncomeDetail;
}

// --- Automatic document checks (sql/052) ---------------------------------------

export type CheckResult = "PASS" | "FAIL" | "UNREAD" | "WAITING";

export interface DocCheck {
  check: string;
  label: string;
  result: CheckResult;
  detail: string | null;
  blocking: boolean;
  at: string;
}

export interface AutoReview {
  at: string;
  trigger: string;
  accepted_now: string[];
  asked_again_now: string[];
  for_a_person: string[];
  still_reading: string[];
  auto_accepted_total: number;
  docs_verified_automatically: boolean;
  credit_checks: string | null;
  recommendation: "APPROVE" | "MAYBE" | "REJECT" | null;
  fast_lane: boolean;
}

export interface DocumentChecks {
  summary: AutoReview | null;
  enabled: boolean;
  documents: Record<string, DocCheck[]>;
  auto_accepted: string[];
}

export async function getDocumentChecks(applicationId: string): Promise<DocumentChecks> {
  const { data, error } = await supabase.rpc("fn_staff_document_checks", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as DocumentChecks;
}

export async function rerunDocumentChecks(applicationId: string): Promise<AutoReview> {
  const { data, error } = await supabase.rpc("fn_staff_rerun_document_checks", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as AutoReview;
}

export interface AutoSettings {
  enabled: boolean;
  auto_accept: boolean;
  auto_verify: boolean;
  auto_credit_checks: boolean;
  reader_wait_minutes: number;
  updated_at: string;
}

export interface RuleCheck {
  check: string;
  label: string;
  enabled: boolean;
  blocking: boolean;
  threshold: number | null;
  threshold_hint: string | null;
  on_fail: "REVIEW" | "ASK_CUSTOMER";
  customer_message: string | null;
}

export interface RuleDocument {
  doc_type: string;
  name: string;
  required: string;
  auto_accept: boolean;
  note: string | null;
  checks: RuleCheck[];
}

export interface AutoRules {
  settings: AutoSettings;
  can_edit: boolean;
  documents: RuleDocument[];
}

export async function getAutoRules(): Promise<AutoRules> {
  const { data, error } = await supabase.rpc("fn_staff_auto_rules");
  if (error) throw new Error(message(error));
  return data as AutoRules;
}

export type AutoRuleChange =
  | { settings: Partial<Omit<AutoSettings, "updated_at">> }
  | { doc_type: string; auto_accept: boolean }
  | {
      doc_type: string;
      check: string;
      enabled?: boolean;
      blocking?: boolean;
      threshold?: number | null;
      on_fail?: "REVIEW" | "ASK_CUSTOMER";
      customer_message?: string;
    };

export async function setAutoRule(change: AutoRuleChange): Promise<AutoRules> {
  const { data, error } = await supabase.rpc("fn_staff_set_auto_rule", { p: change });
  if (error) throw new Error(message(error));
  return data as AutoRules;
}
