
export type DocumentStatus = "pending" | "uploaded" | "processing" | "extracted" | "verified" | "failed";

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  file_name: string;
  file_size: number;
  status: DocumentStatus;
  extracted_data?: Record<string, any>;
  confidence?: "high" | "medium" | "low";
  verified_by?: string;
  verified_at?: string;
}

export interface DocumentChecklist {
  required: string[];
  uploaded: string[];
  verified: string[];
  missing: string[];
  completionPercent: number;
  allVerified: boolean;
}

export function getRequiredDocuments(applicantType: "salaried" | "self_employed"): string[] {
  if (applicantType === "salaried") {
    return [
      "salary_slip_1", "salary_slip_2", "salary_slip_3",
      "bank_statement_6mo",
      "pan_card", "aadhaar", "address_proof",
    ];
  }
  return [
    "bank_statement_12mo",
    "gst_return_1", "gst_return_2",
    "itr_1", "itr_2",
    "pan_card", "aadhaar", "address_proof",
  ];
}

export function buildChecklist(requiredDocs: string[], uploadedDocs: { document_type: string; status: DocumentStatus }[]): DocumentChecklist {
  const uploaded = uploadedDocs.map((d) => d.document_type);
  const verified = uploadedDocs.filter((d) => d.status === "verified").map((d) => d.document_type);
  const missing = requiredDocs.filter((r) => !uploaded.includes(r));
  const total = requiredDocs.length;
  const uploadedCount = uploaded.filter((u) => requiredDocs.includes(u)).length;
  const verifiedCount = verified.filter((v) => requiredDocs.includes(v)).length;

  return {
    required: requiredDocs,
    uploaded,
    verified,
    missing,
    completionPercent: total > 0 ? Math.round((verifiedCount / total) * 100) : 0,
    allVerified: missing.length === 0 && verifiedCount === total,
  };
}
