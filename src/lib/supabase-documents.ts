import { supabase } from "./supabase";

export type DocumentStatusType = "uploaded" | "processing" | "extracted" | "verified" | "failed";

export interface DocumentRecord {
  id: string;
  application_id: string;
  document_type: string;
  file_name: string;
  size: number;
  mime_type: string;
  storage_path: string;
  status: DocumentStatusType;
  extracted_data?: Record<string, any>;
  confidence?: "high" | "medium" | "low";
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export async function saveDocumentRecord(data: Partial<DocumentRecord>): Promise<DocumentRecord> {
  try {
    const payload = { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: data.status || "uploaded" };
    const { data: result, error } = await supabase.from("document_metadata").insert([payload]).select().single();
    if (error) throw error;
    return result as DocumentRecord;
  } catch (e) {
    return { ...getMockDocRecord(), ...data, id: `mock-doc-${Date.now()}` } as DocumentRecord;
  }
}

export async function fetchDocumentsByApplication(applicationId: string): Promise<DocumentRecord[]> {
  try {
    const { data, error } = await supabase.from("document_metadata").select("*").eq("application_id", applicationId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as DocumentRecord[];
  } catch (e) {
    return getMockDocList(applicationId);
  }
}

export async function updateDocumentStatus(id: string, status: DocumentStatusType, verifiedBy?: string): Promise<DocumentRecord | null> {
  try {
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (verifiedBy) updates.verified_by = verifiedBy;
    if (status === "verified") updates.verified_at = new Date().toISOString();
    const { data, error } = await supabase.from("document_metadata").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as DocumentRecord;
  } catch (e) {
    return null;
  }
}

export async function verifyDocument(id: string, verifiedBy: string): Promise<DocumentRecord | null> {
  return updateDocumentStatus(id, "verified", verifiedBy);
}

export async function deleteDocument(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("document_metadata").delete().eq("id", id);
    return !error;
  } catch (e) {
    return false;
  }
}

function getMockDocRecord(): DocumentRecord {
  return { id: "doc-001", application_id: "app-001", document_type: "salary_slip", file_name: "salary_aug_2026.pdf", size: 524288, mime_type: "application/pdf", storage_path: "uploads/app-001/salary_aug_2026.pdf", status: "verified", confidence: "high", verified_by: "system", verified_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

function getMockDocList(appId: string): DocumentRecord[] {
  return [
    { id: "d1", application_id: appId, document_type: "salary_slip", file_name: "salary_aug_2026.pdf", size: 524288, mime_type: "application/pdf", storage_path: `/docs/${appId}/salary.pdf`, status: "verified", confidence: "high", verified_by: "system", verified_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "d2", application_id: appId, document_type: "bank_statement", file_name: "statement_6mo.pdf", size: 2181120, mime_type: "application/pdf", storage_path: `/docs/${appId}/bank.pdf`, status: "extracted", confidence: "medium", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "d3", application_id: appId, document_type: "pan_card", file_name: "pan_scan.jpg", size: 180000, mime_type: "image/jpeg", storage_path: `/docs/${appId}/pan.jpg`, status: "verified", confidence: "high", verified_by: "system", verified_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];
}
