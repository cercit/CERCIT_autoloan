# Unused modules in `src/lib` (backlog FD6.1)

Checked 17 Sep 2026: none of these files is imported anywhere in `src`, `scripts`, `tests` or `aws`. They add nothing to the built app. Following the rebuild rule — replace piece by piece — each is kept until the module that needs it or replaces it is built, then reused or deleted in that module's retire step.

`supabase-rpc.ts` was deleted in FD6.1: it called eight database functions that do not exist.

| Module | Lines | Fate | When |
|---|---:|---|---|
| `aadhaar-validator` | 147 | Reuse for Aadhaar format and checksum checks. Never store the full number | KYC (KY4.3) |
| `pan-validator` | 93 | Reuse as the format check before the live PAN verification call | KYC (KY4.5) |
| `indian-date-utils` | 81 | Reuse where document dates are parsed or shown | Underwriting |
| `ccr-parser` | 104 | Compare with the bureau Lambda extractor; keep one | Underwriting (UW3.1) |
| `document-orchestrator` | 58 | Compare with `aws-doc-api`; keep one | Underwriting (UW1.2) |
| `document-classifier` | 80 | Duplicates the Lambda classifier — delete if the Lambda covers it | Underwriting (UW1.2) |
| `bank-statement-parser` | 433 | Duplicates the bank statement Lambda — delete | Underwriting (UW4.1) |
| `salary-slip-parser` | 127 | Duplicates the salary slip Lambda — delete | Underwriting (UW1.2) |
| `address-proof-parser` | 86 | Duplicates the KYC Lambda — delete | Underwriting (UW1.2) |
| `pdf-text-extract` | 72 | Placeholder implementation — delete | Underwriting (UW1.2) |
| `cashflow-analyzer` | 194 | Check against the cash-flow summary built in UW4.2; reuse or delete | Underwriting (UW4.2) |
| `transaction-categorizer` | 56 | Same as above | Underwriting (UW4.2) |
| `employer-verifier` | 77 | Check against the employer master; reuse or delete | Underwriting |
| `bureau-api-mock` | 81 | Delete once the mock provider adapter exists | Underwriting (UW3.1) |
| `cam-data-assembler` | 224 | Candidate for the credit memo view; reuse or delete | Underwriting / Sanction |
| `foir-calculator` | 63 | **Do not reuse as is** — computes FOIR on gross income, but decision 0.1 is net salary + other income | Credit control (CC6.1): fix or delete |
| `ltv-calculator` | 57 | Check against decision 0.2 (ex-showroom primary) before reuse | Credit control (CC6.2) |
| `scheme-eligibility` | 55 | Replaced by versioned policy settings — delete | Credit control |
| `agreement-generator` | 82 | Reuse for the loan agreement | Sanction |
| `supabase-application` | 147 | Superseded by `api.ts` — delete when the module owning applications is built | Underwriting |
| `supabase-bureau` | 72 | Same | Underwriting |
| `supabase-documents` | 79 | Same | Underwriting |
| `supabase-dealers` | 87 | Same | Underwriting |
| `supabase-decision-log` | 102 | Same | Compliance |
