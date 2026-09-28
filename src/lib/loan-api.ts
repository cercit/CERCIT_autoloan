import type { DraftDocument } from "./customer-api";
import type { OrgInfo } from "./doc-pdf";
import { supabase } from "./supabase";

// After approval (sql/049): the loan offer and KFS, the agreement, the EMI
// mandate and the disbursed loan. The same shape serves the customer and staff.

function message(error: { message?: string } | null): string {
  const m = (error?.message ?? "Something went wrong").replace(/^.*?ERROR:\s*/, "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export interface LoanOffer {
  id: string;
  version: number;
  status: "ISSUED" | "ACCEPTED" | "EXPIRED" | "WITHDRAWN";
  expired: boolean;
  sanction_ref: string;
  kfs_ref: string;
  sanctioned_amount: number;
  rate_pct: number;
  rate_type: string;
  tenure_months: number;
  emi: number;
  processing_fee: number;
  documentation_charge: number;
  gst_on_fees: number;
  stamp_duty: number;
  total_upfront: number;
  net_disbursal: number;
  apr_pct: number;
  total_interest: number;
  total_payable: number;
  emi_day: number;
  indicative_first_emi: string;
  penal_charge: number;
  bounce_charge: number;
  foreclosure_pct: number;
  foreclosure_lock_emis: number;
  cooling_off_days: number;
  dealer_name: string | null;
  vehicle: string | null;
  valid_until: string;
  kfs_hash: string;
  issued_at: string;
  accepted_at: string | null;
  officer: string | null;
}

export interface LoanAgreement {
  id: string;
  agreement_ref: string;
  template_version: string;
  snapshot: AfterApproval;
  content_hash: string;
  status: "READY" | "SIGNED" | "VOID";
  signer_name: string | null;
  sign_method: string | null;
  code_verified_at: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface Mandate {
  holder_name: string;
  bank_name: string;
  ifsc: string;
  account: string;
  account_type: string;
  max_amount: number;
  frequency: string;
  start_date: string;
  end_date: string;
  umrn: string;
  mode: string;
  status: string;
  created_at: string;
}

export interface LoanAccount {
  loan_account_no: string;
  disbursed_on: string;
  disbursed_amount: number;
  net_paid: number;
  paid_to: string;
  payment_ref: string;
  emi: number;
  tenure_months: number;
  rate_pct: number;
  first_emi_date: string;
  installment_day: number;
  status: string;
  schedule: { no: number; due: string; emi: number; principal: number; interest: number }[];
}

export interface AfterApproval {
  application: {
    application_id: string;
    status: string;
    approval_stage: string | null;
    decided_at: string | null;
  };
  customer: {
    full_name: string;
    email: string;
    pan: string | null;
    mobile: string;
    dob: string | null;
    father_name: string | null;
    address: {
      line1: string;
      line2: string | null;
      city: string;
      state: string | null;
      pincode: string;
    } | null;
  };
  vehicle: {
    make: string;
    model: string;
    variant: string | null;
    colour: string | null;
    fuel: string | null;
    dealer: string | null;
    ex_showroom: number;
    on_road: number;
  } | null;
  offer: LoanOffer | null;
  agreement: LoanAgreement | null;
  mandate: Mandate | null;
  loan: LoanAccount | null;
  documents: DraftDocument[];
  org: Partial<OrgInfo> & { company_name?: string };
}

export async function getMyLoan(applicationId: string): Promise<AfterApproval> {
  const { data, error } = await supabase.rpc("fn_customer_after_approval", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as AfterApproval;
}

export async function getCaseLoan(applicationId: string): Promise<AfterApproval> {
  const { data, error } = await supabase.rpc("fn_staff_after_approval", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(message(error));
  return data as AfterApproval;
}

/** True when the database refused because the last email code is too old. */
export const needsCode = (e: unknown) => /code we email you/i.test((e as Error)?.message ?? "");

export async function acceptOffer(applicationId: string, kfsHash: string): Promise<void> {
  const { error } = await supabase.rpc("fn_customer_accept_offer", {
    p_application_id: applicationId,
    p_kfs_hash: kfsHash,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(message(error));
}

export async function signAgreement(
  applicationId: string,
  contentHash: string,
  signerName: string,
): Promise<void> {
  const { error } = await supabase.rpc("fn_customer_sign_agreement", {
    p_application_id: applicationId,
    p_content_hash: contentHash,
    p_signer_name: signerName,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(message(error));
}

export async function setMandate(
  applicationId: string,
  p: {
    holder_name: string;
    bank_name: string;
    ifsc: string;
    account_number: string;
    account_type: "SAVINGS" | "CURRENT";
  },
): Promise<void> {
  const { error } = await supabase.rpc("fn_customer_set_mandate", {
    p_application_id: applicationId,
    p,
  });
  if (error) throw new Error(message(error));
}

export async function issueOffer(
  applicationId: string,
  p: { amount?: number; rate_pct?: number; tenure_months?: number } = {},
): Promise<void> {
  const { error } = await supabase.rpc("fn_staff_issue_offer", {
    p_application_id: applicationId,
    p,
  });
  if (error) throw new Error(message(error));
}

export async function disburse(
  applicationId: string,
  paymentRef?: string,
): Promise<{ loan_account_no: string }> {
  const { data, error } = await supabase.rpc("fn_staff_disburse", {
    p_application_id: applicationId,
    p: paymentRef ? { payment_ref: paymentRef } : {},
  });
  if (error) throw new Error(message(error));
  return data as { loan_account_no: string };
}
