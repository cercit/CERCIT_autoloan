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

export async function getConsentText(purpose = "APPLICATION_PROCESSING"): Promise<ConsentText | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.rpc("fn_consent_text", { p_purpose: purpose });
  return (data as ConsentText) ?? null;
}

/** Sends the email code. New customers get a login created on first use. */
export async function sendCustomerEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login?as=customer` },
  });
  if (error) throw new Error(message(error));
}

export async function verifyCustomerEmailCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
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

export async function saveVehicle(applicationId: string, v: VehicleInput): Promise<{ step: number; quote_pending: boolean }> {
  const { data, error } = await supabase.rpc("fn_customer_save_vehicle", { p_application_id: applicationId, p: v });
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
