# Unused modules in `src/lib` (backlog FD6.1)

Checked 17 Sep 2026: none of these files is imported anywhere in `src`, `scripts`, `tests` or `aws`. They add nothing to the built app. Following the rebuild rule — replace piece by piece — each is kept until the module that needs it or replaces it is built, then reused or deleted in that module's retire step.

`supabase-rpc.ts` was deleted in FD6.1: it called eight database functions that do not exist.

3 Oct 2026 (fix list H8): 13 of the files below deleted, as marked, plus `supabase-audit-trail.ts` (it read the `audit_trail` table, which does not exist; its one type moved into `audit-trail-timeline.tsx`). The rest are still kept for reuse.

| Module | Lines | Fate | When |
|---|---:|---|---|
| `aadhaar-validator` | 147 | Reuse for Aadhaar format and checksum checks. Never store the full number | KYC (KY4.3) |
| `pan-validator` | 93 | Reuse as the format check before the live PAN verification call | KYC (KY4.5) |
| `indian-date-utils` | 81 | Reuse where document dates are parsed or shown | Underwriting |
| `ccr-parser` | 104 | Compare with the bureau Lambda extractor; keep one | Underwriting (UW3.1) |
| `document-orchestrator` | 58 | Compare with `aws-doc-api`; keep one | Underwriting (UW1.2) |
| `document-classifier` | 80 | **Deleted 3 Oct 2026 (fix list H8)**: the Lambda classifier covers it | — |
| `bank-statement-parser` | 433 | Duplicates the bank statement Lambda — delete | Underwriting (UW4.1) |
| `salary-slip-parser` | 127 | **Deleted 3 Oct 2026 (fix list H8)**: the salary slip Lambda covers it | — |
| `address-proof-parser` | 86 | **Deleted 3 Oct 2026 (fix list H8)**: the KYC Lambda covers it | — |
| `pdf-text-extract` | 72 | **Deleted 3 Oct 2026 (fix list H8)**: placeholder | — |
| `cashflow-analyzer` | 194 | Check against the cash-flow summary built in UW4.2; reuse or delete | Underwriting (UW4.2) |
| `transaction-categorizer` | 56 | Same as above | Underwriting (UW4.2) |
| `employer-verifier` | 77 | **Deleted 3 Oct 2026 (fix list H8)**: replaced by the Employer Master (069) | — |
| `bureau-api-mock` | 81 | **Deleted 3 Oct 2026 (fix list H8)**: replaced by the simulated bureau in the database (053) | — |
| `cam-data-assembler` | 224 | Candidate for the credit memo view; reuse or delete | Underwriting / Sanction |
| `foir-calculator` | 63 | **Deleted 3 Oct 2026 (fix list H8)**: FOIR is worked out by the database engine on net income (031, 070) | — |
| `ltv-calculator` | 57 | Check against decision 0.2 (ex-showroom primary) before reuse | Credit control (CC6.2) |
| `scheme-eligibility` | 55 | **Deleted 3 Oct 2026 (fix list H8)**: replaced by versioned policy settings | — |
| `agreement-generator` | 82 | Reuse for the loan agreement | Sanction |
| `supabase-application` | 147 | **Deleted 3 Oct 2026 (fix list H8)**: superseded by api.ts | — |
| `supabase-bureau` | 72 | **Deleted 3 Oct 2026 (fix list H8)**: superseded by api.ts | — |
| `supabase-documents` | 79 | **Deleted 3 Oct 2026 (fix list H8)**: superseded by api.ts | — |
| `supabase-dealers` | 87 | **Deleted 3 Oct 2026 (fix list H8)**: superseded by api.ts | — |
| `supabase-decision-log` | 102 | **Deleted 3 Oct 2026 (fix list H8)**: superseded by api.ts; read a table that does not exist | — |
