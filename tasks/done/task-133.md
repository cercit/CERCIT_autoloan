---
type: new
target: src/lib/document-orchestrator.ts
---

## Instructions

Create a TypeScript module that coordinates the full document processing pipeline for one loan application.

Requirements:
- Named export type `DocumentStatus`: `"pending" | "uploaded" | "extracting" | "extracted" | "verified" | "failed"`
- Named export type `ApplicationDocument`:
  - `id: string`
  - `type: string` — document type (salary_slip, bank_statement, pan_card, aadhaar, address_proof)
  - `fileName: string`
  - `fileSize: number`
  - `status: DocumentStatus`
  - `extractedData: Record<string, unknown> | null`
  - `confidence: "high" | "medium" | "low" | null`
  - `errorMessage: string | null`
  - `uploadedAt: string | null`
  - `processedAt: string | null`
- Named export type `DocumentChecklist`:
  - `required: Array<{type: string; label: string; uploaded: boolean; verified: boolean}>`
  - `optional: Array<{type: string; label: string; uploaded: boolean; verified: boolean}>`
  - `completionPct: number` — percentage of required docs uploaded
  - `allRequiredVerified: boolean`
- Named export `getRequiredDocuments(applicantType: "salaried" | "self_employed"): Array<{type: string; label: string; required: boolean}>`
  - Salaried: salary_slip (required x3 months), bank_statement (required x6 months), pan_card (required), aadhaar (required), address_proof (required), employment_letter (optional)
  - Self-employed: bank_statement (required x12 months), gst_return (required x2 years), itr (required x2 years), pan_card (required), aadhaar (required), address_proof (required)
- Named export `buildChecklist(requiredDocs: Array<{type: string; label: string; required: boolean}>, uploadedDocs: ApplicationDocument[]): DocumentChecklist`
  - Match uploaded docs against required list
  - Compute completion percentage (required docs only)
- Named export `generateDocumentId(): string` — "DOC-" + random 8 hex chars
- Pure TypeScript, no deps
