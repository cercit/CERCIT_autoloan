---
type: new
target: src/lib/document-classifier.ts
---

## Instructions

Create a TypeScript module that auto-detects the type of an uploaded document from its extracted text.

Requirements:
- Named export type `DocumentType`: `"salary_slip" | "bank_statement" | "pan_card" | "aadhaar" | "address_proof" | "gst_return" | "itr" | "employment_letter" | "unknown"`
- Named export type `ClassificationResult`:
  - `type: DocumentType`
  - `confidence: "high" | "medium" | "low"`
  - `matchedKeywords: string[]`
- Named export `classifyDocument(text: string, fileName?: string): ClassificationResult`
  - First check file name for hints: "salary" → salary_slip, "bank" or "statement" → bank_statement, "pan" → pan_card, "aadhaar" or "aadhar" → aadhaar, etc.
  - Then scan text for keyword clusters (case-insensitive):
    - salary_slip: ["gross salary", "net pay", "basic salary", "hra", "payslip", "pay slip", "deductions", "provident fund"]
    - bank_statement: ["opening balance", "closing balance", "transaction", "debit", "credit", "account number", "ifsc"]
    - pan_card: ["permanent account number", "income tax department", "govt of india"]
    - aadhaar: ["unique identification", "uidai", "aadhaar", "enrollment"]
    - address_proof: ["electricity bill", "water bill", "rent agreement", "lease", "utility", "telephone bill", "gas bill"]
    - gst_return: ["gstin", "gstr", "goods and services tax", "taxable value", "igst", "cgst"]
    - itr: ["income tax return", "assessment year", "total income", "form 16", "form-16"]
    - employment_letter: ["employment", "designation", "date of joining", "annual ctc", "hereby certify"]
  - Count keyword matches. Highest count wins. Confidence: high if 3+ matches, medium if 2, low if 1, unknown if 0.
- Named export `DOCUMENT_LABELS: Record<DocumentType, string>` — human-readable: salary_slip → "Salary slip", bank_statement → "Bank statement", etc.
- Pure TypeScript, no deps
