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
): Promise<{ drafts: number; rows: QueueRow[] }> {
  const { data, error } = await supabase.rpc("fn_staff_customer_queue", { p_scope: scope });
  if (error) throw new Error(message(error));
  return data as { drafts: number; rows: QueueRow[] };
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
