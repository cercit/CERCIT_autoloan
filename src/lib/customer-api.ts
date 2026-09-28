import { supabase, isSupabaseConfigured } from "./supabase";

// Customer onboarding (sql/043). Every call acts only on the signed-in
// customer's own draft; the database enforces that, not this file.

export interface ConsentText {
  purpose: string;
  version: string;
  body: string;
}

export interface DraftDocument {
  doc_type: string;
  name: string;
  required: "ALWAYS" | "CONDITIONAL" | "OPTIONAL";
  status: "MISSING" | "RECEIVED" | "ACCEPTED" | "REUPLOAD" | "WAIVED" | "NOT_NEEDED";
  note: string | null;
  sides: number;
  back_required?: boolean;
  multi_file?: boolean;
  ask_password?: boolean;
  files?: {
    side: "front" | "back" | "single";
    file_name: string;
    size: number;
    uploaded_at: string;
    unlocked?: boolean;
    masked?: boolean;
  }[];
}

export interface DraftVehicle {
  source: "QUOTATION" | "MANUAL";
  make: string;
  model: string;
  variant: string | null;
  colour: string | null;
  fuel_type: string | null;
  dealer_name: string | null;
  sales_officer_name: string | null;
  sales_officer_mobile: string | null;
  quote_date: string | null;
  valid_until: string | null;
  ex_showroom: number;
  road_tax: number | null;
  insurance: number | null;
  on_road: number | null;
  loan_amount_requested: number;
  tenure_months: number;
}

export interface CustomerState {
  customer: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string;
    mobile_last4: string | null;
    mobile_check: "SMS" | "SIMULATED" | null;
  } | null;
  draft: {
    application_id: string;
    step: number;
    quote_pending: boolean;
    vehicle: DraftVehicle | null;
    documents: DraftDocument[];
  } | null;
}

export interface VehicleInput {
  source: "QUOTATION" | "MANUAL";
  make: string;
  model: string;
  variant?: string;
  colour?: string;
  fuel_type?: string;
  dealer_name?: string;
  sales_officer_name?: string;
  sales_officer_mobile?: string;
  quote_date?: string;
  valid_until?: string;
  ex_showroom: number;
  road_tax?: number;
  insurance?: number;
  loan_amount: number;
  tenure_months: number;
}

function message(error: { message?: string } | null): string {
  const m = (error?.message ?? "Something went wrong").replace(/^.*?ERROR:\s*/, "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export async function getConsentText(
  purpose = "APPLICATION_PROCESSING",
): Promise<ConsentText | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.rpc("fn_consent_text", { p_purpose: purpose });
  return (data as ConsentText) ?? null;
}

/** Sends the email code. New customers get a login created on first use. */
export async function sendCustomerEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login?as=customer`,
    },
  });
  if (error) throw new Error(message(error));
}

export async function verifyCustomerEmailCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) throw new Error(message(error));
}

export async function startApplication(input: {
  firstName: string;
  middleName: string;
  lastName: string;
  mobile: string;
  mobileMethod: "SMS" | "SIMULATED";
  consentVersion: string;
}): Promise<{ application_id: string; step: number }> {
  const { data, error } = await supabase.rpc("fn_customer_start", {
    p_first_name: input.firstName,
    p_middle_name: input.middleName,
    p_last_name: input.lastName,
    p_mobile: input.mobile,
    p_mobile_method: input.mobileMethod,
    p_consent_version: input.consentVersion,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(message(error));
  return data as { application_id: string; step: number };
}

export async function getCustomerState(): Promise<CustomerState> {
  const { data, error } = await supabase.rpc("fn_customer_current");
  if (error) throw new Error(message(error));
  return data as CustomerState;
}

export async function saveVehicle(
  applicationId: string,
  v: VehicleInput,
): Promise<{ step: number; quote_pending: boolean }> {
  const { data, error } = await supabase.rpc("fn_customer_save_vehicle", {
    p_application_id: applicationId,
    p: v,
  });
  if (error) throw new Error(message(error));
  return data as { step: number; quote_pending: boolean };
}

/**
 * Mobile OTP is simulated until an SMS provider is connected (reconcile list).
 * The code is generated here and shown on screen, and the application records
 * the check as SIMULATED so it is never mistaken for a real SMS check.
 */
export function simulatedMobileCode(): string {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 900000;
  return String(100000 + n);
}

export interface UploadType {
  upload_type: string;
  folder: string;
  allowed_mime: string[];
  max_mb: number;
  name: string;
  required: DraftDocument["required"];
  note: string | null;
  sides: number;
  sort: number;
  back_required: boolean;
  multi_file: boolean;
  ask_password: boolean;
  stage?: "APPLICATION" | "BEFORE_DISBURSAL" | "AFTER_DISBURSAL";
}

export async function getUploadTypes(): Promise<Record<string, UploadType>> {
  const { data, error } = await supabase.rpc("fn_document_upload_types");
  if (error) throw new Error(message(error));
  return (data ?? {}) as Record<string, UploadType>;
}

export async function registerDocument(input: {
  applicationId: string;
  docType: string;
  side: "front" | "back" | "single";
  key: string;
  file: File;
  sha256: string;
  backend: "s3" | "supabase";
  wasLocked: boolean;
}): Promise<{ status: DraftDocument["status"] }> {
  const { data, error } = await supabase.rpc("fn_customer_register_document", {
    p_application_id: input.applicationId,
    p_doc_type: input.docType,
    p_side: input.side,
    p_storage_key: input.key,
    p_file_name: input.file.name,
    p_mime_type: input.file.type,
    p_size_bytes: input.file.size,
    p_sha256: input.sha256,
    p_backend: input.backend,
    p_was_locked: input.wasLocked,
  });
  if (error) throw new Error(message(error));
  return data as { status: DraftDocument["status"] };
}

// --- Step 4, submit and tracking (sql/046) ---------------------------------

export type DetailGroup = "PERSONAL" | "ADDRESS" | "EMPLOYMENT";

export interface AddressInput {
  line1: string;
  line2?: string;
  city: string;
  state_code: string;
  pincode: string;
}

export interface DetailsState {
  groups: Partial<Record<DetailGroup, { values: Record<string, unknown>; confirmed_at: string }>>;
  customer: { full_name: string; email: string; pan_last4: string | null } | null;
  states: { code: string; name: string }[];
  eb_bill: { required: string; status: string } | null;
}

export async function getDetails(applicationId: string): Promise<DetailsState> {
  const { data, error } = await supabase.rpc("fn_customer_details", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as DetailsState;
}

/** Saves one group as confirmed. `shown` is what we pre-filled, so changes to it are recorded. */
export async function saveDetails(
  applicationId: string,
  group: DetailGroup,
  values: Record<string, unknown>,
  shown: Record<string, unknown>,
): Promise<{ values: Record<string, unknown>; edited: string[] }> {
  const { data, error } = await supabase.rpc("fn_customer_save_details", {
    p_application_id: applicationId,
    p_group: group,
    p: values,
    p_prefilled: shown,
  });
  if (error) throw new Error(message(error));
  return data as { values: Record<string, unknown>; edited: string[] };
}

export async function submitApplication(
  applicationId: string,
  bureauConsentVersion: string,
): Promise<{ status: string; approval_stage: string }> {
  const { data, error } = await supabase.rpc("fn_customer_submit", {
    p_application_id: applicationId,
    p_bureau_consent_version: bureauConsentVersion,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(message(error));
  return data as { status: string; approval_stage: string };
}

export interface TrackedApplication {
  application_id: string;
  status: string;
  approval_stage: "IN_PRINCIPLE" | "FINAL" | null;
  submitted_at: string;
  decided_at: string | null;
  loan_amount: number | null;
  tenure_months: number | null;
  vehicle: string | null;
  events: { stage: string; at: string; note?: string | null }[];
  // Documents waiting on the customer: asked for again by the officer, or the quotation (sql/047).
  attention: DraftDocument[];
  // After approval (sql/049).
  loan?: {
    offer: {
      status: "ISSUED" | "ACCEPTED" | "EXPIRED" | "WITHDRAWN";
      valid_until: string;
      amount: number;
      emi: number;
      apr_pct: number;
    } | null;
    agreement: "READY" | "SIGNED" | null;
    mandate: boolean;
    account: string | null;
  };
}

export interface TrackingState {
  customer: { first_name: string; email: string } | null;
  draft: { application_id: string; step: number } | null;
  applications: TrackedApplication[];
}

export async function getTracking(): Promise<TrackingState> {
  const { data, error } = await supabase.rpc("fn_customer_track");
  if (error) throw new Error(message(error));
  return data as TrackingState;
}
