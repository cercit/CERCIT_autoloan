/**
 * AWS Document Extraction API client.
 *
 * Handles: presigned URL generation, direct S3 upload from browser,
 * polling for extraction results, and cross-document validation.
 *
 * The API_BASE is set after deploying the SAM template —
 * it outputs the API Gateway URL.
 */

import { supabase } from "./supabase";

const API_BASE = import.meta.env["VITE_AWS_API_URL"] ?? "";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to upload documents");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export type DocType =
  | "salary_slip"
  | "form16"
  | "pan_card"
  | "aadhaar_card"
  | "bank_statement"
  | "bureau_report";

export interface ExtractionField {
  value: string | number;
  confidence: number;
  derived?: boolean;
  source?: string;
}

export interface ExtractionResult {
  applicationId: string;
  extractions: Record<string, Record<string, ExtractionField>>;
  documentCount: number;
}

export interface ValidationCheck {
  check: string;
  doc_a: string;
  doc_b: string;
  passed: boolean;
  similarity?: number;
  value_a?: string;
  value_b?: string;
}

export interface PresignedResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export function isAwsConfigured(): boolean {
  return API_BASE.length > 0;
}

export async function getPresignedUrl(
  applicationId: string,
  docType: DocType,
  fileName: string,
  contentType: string = "application/pdf"
): Promise<PresignedResponse> {
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ applicationId, docType, fileName, contentType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to get upload URL");
  }

  return res.json();
}

export async function uploadToS3(
  presignedUrl: string,
  file: File
): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`S3 upload failed: ${res.status}`);
  }
}

export async function uploadDocument(
  applicationId: string,
  docType: DocType,
  file: File
): Promise<string> {
  const { uploadUrl, key } = await getPresignedUrl(
    applicationId,
    docType,
    file.name,
    file.type
  );
  await uploadToS3(uploadUrl, file);
  return key;
}

export async function getExtractions(
  applicationId: string
): Promise<ExtractionResult> {
  const res = await fetch(`${API_BASE}/extraction/${encodeURIComponent(applicationId)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch extractions");
  return res.json();
}

export async function pollForExtraction(
  applicationId: string,
  docType: DocType,
  maxWaitMs: number = 30000,
  intervalMs: number = 3000
): Promise<Record<string, ExtractionField> | null> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const result = await getExtractions(applicationId);
    const extraction = result.extractions[docType];
    if (extraction && Object.keys(extraction).length > 0) {
      return extraction;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return null;
}

export async function runCrossValidation(
  applicationId: string
): Promise<ValidationCheck[]> {
  const res = await fetch(`${API_BASE}/validate/${encodeURIComponent(applicationId)}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ application_id: applicationId }),
  });

  if (!res.ok) throw new Error("Validation request failed");
  const data = await res.json();
  return data.checks ?? [];
}

export function confidenceLevel(
  score: number
): "high" | "medium" | "low" {
  if (score >= 0.9) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

export function mapExtractionToFields(
  extraction: Record<string, ExtractionField>
): Array<{
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  editable: boolean;
  fieldKey: string;
}> {
  const LABEL_MAP: Record<string, string> = {
    employer_name: "Employer",
    employee_name: "Employee name",
    gross_salary: "Gross salary",
    net_salary: "Net salary",
    basic_salary: "Basic salary",
    hra: "HRA",
    pf_deduction: "PF deduction",
    esi_deduction: "ESI",
    tds_deduction: "TDS",
    professional_tax: "Professional tax",
    pay_period: "Pay period",
    pan: "PAN",
    pan_number: "PAN number",
    employer_tan: "Employer TAN",
    assessment_year: "Assessment year",
    gross_total_income: "Gross total income",
    tds_deducted: "TDS deducted",
    total_deductions: "Chapter VI-A deductions",
    name: "Name",
    father_name: "Father's name",
    dob: "Date of birth",
    aadhaar_number: "Aadhaar (masked)",
    gender: "Gender",
    address: "Address",
    avg_monthly_balance: "Avg monthly balance",
    avg_salary: "Avg salary credit",
    salary_count: "Salary credits found",
    emi_count: "EMI debits found",
    emi_total: "Total EMI burden",
    bounce_count: "Cheque bounces",
    months_analyzed: "Months analyzed",
    bureau_name: "Bureau",
    score: "Credit score",
    dpd_30: "DPD 30 accounts",
    dpd_60: "DPD 60 accounts",
    dpd_90: "DPD 90+ accounts",
    active_accounts: "Active accounts",
    total_accounts: "Total accounts",
    total_outstanding: "Total outstanding",
    total_credit_limit: "Total credit limit",
    enquiries_90d: "Enquiries (90 days)",
    report_date: "Report date",
  };

  return Object.entries(extraction)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, field]) => ({
      fieldKey: key,
      label: LABEL_MAP[key] ?? key.replace(/_/g, " "),
      value: String(field.value),
      confidence: confidenceLevel(field.confidence),
      editable: true,
    }));
}
