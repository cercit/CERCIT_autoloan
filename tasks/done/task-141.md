---
type: new
target: src/lib/supabase-documents.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module for document file metadata storage in Supabase (not the actual file upload, just the metadata tracking).

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `DocumentRecord`:
  - `id: string`
  - `application_id: string`
  - `created_at: string`
  - `document_type: string` — salary_slip, bank_statement, pan_card, aadhaar, address_proof, etc.
  - `file_name: string`
  - `file_size: number`
  - `mime_type: string`
  - `storage_path: string | null` — Supabase storage bucket path
  - `status: "uploaded" | "processing" | "extracted" | "verified" | "failed"`
  - `extracted_data: Record<string, unknown> | null` — JSONB
  - `extraction_confidence: string | null`
  - `verified_by: string | null`
  - `verified_at: string | null`
  - `error_message: string | null`
- Named export `async function saveDocumentRecord(data: Omit<DocumentRecord, "id" | "created_at">): Promise<DocumentRecord | null>`
- Named export `async function fetchDocumentsByApplication(applicationId: string): Promise<DocumentRecord[]>`
- Named export `async function updateDocumentStatus(id: string, status: string, extractedData?: Record<string, unknown>, confidence?: string): Promise<boolean>`
- Named export `async function verifyDocument(id: string, verifierId: string): Promise<boolean>`
- Named export `async function deleteDocument(id: string): Promise<boolean>`
- Mock fallback: 3 sample documents (a salary slip, bank statement, PAN card) with realistic metadata
- No React
