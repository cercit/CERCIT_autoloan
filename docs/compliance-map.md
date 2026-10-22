# Compliance map: cercit against RBI and data rules

Written 22 Oct 2026 (fix list R5). One page for anyone who asks "is it RBI compliant?"

**The short answer:** cercit is *designed with RBI's rules in mind*; it isn't "RBI compliant", and can't be. Compliance belongs to a regulated lender: its board-approved policies, audits and reports to RBI. A tool helps a lender comply. cercit is also a demo: every customer is synthetic and the bureau, KYC and bank links are simulated.

Status: ✅ built · ⚠️ built with known gaps · ❌ not built · 🏦 the lender's job, not the tool's.

| Area | What the rule asks (in short) | What cercit does | Status | Where |
|---|---|---|---|---|
| **Digital lending: disclosure** | Key Fact Statement with the all-in cost (APR) before the borrower signs; sanction letter on the lender's letterhead | KFS and APR in the sanction and approval letters | ✅ | sanction / approval letters (2 Sep) |
| **Digital lending: money flow** | Disbursal and repayment directly between the borrower's and the lender's accounts, no pass-through | Disbursal to the dealer / borrower recorded from the lender's side; no wallet or pooled account | ✅ (as modelled) | loan book (056, 075) |
| **Grievance redressal and fair practices** | Named grievance officer, published fair practices code, list of lending partners | Pages linked in the site footer | ✅ | footer pages |
| **Reasons for a decision** | Borrowers told why; decisions explainable | Plain-English reasons on every decision; a credit officer signs off | ✅ | review screen, `fn_officer_decision` |
| **AI and model risk** (RBI draft guidance, June 2026; Governor's speech, Aug 2026) | Lender accountable for model outcomes; explainable; a person can override; inventory, validation, monitoring, kill switch | Rules decide, AI assists; override with reasons; model version recorded on every decision; Head proposes, Admin approves model changes | ⚠️ inventory, independent validation and drift monitoring not built (R9) | `docs/risk-model-v2.md` |
| **KYC: Aadhaar redaction** (PML Rule 9(16); RBI KYC rules since 29 May 2019) | Where authentication isn't needed, the Aadhaar number must be redacted on any kept copy | First 8 digits and the QR blacked out before storage; unmaskable files refused; only the last 4 digits stored; staff uploads masked too | ⚠️ the original sits in `incoming/` for seconds before masking; browser-side masking is G10 | `document_finalize` (G9, R1, 22 Oct) |
| **KYC: identification routes** | Aadhaar authentication / offline verification, CKYC registry, video KYC, OVDs | Document upload and reading only | ❌ Phase 2 (R6) | — |
| **Credit bureau reporting** (CICRA) | Report every loan to the credit bureaus monthly | Not built | ❌ Phase 2 (R7) | — |
| **Anti-money-laundering** (PMLA) | Flag suspicious transactions; report to FIU-IND | Not built | ❌ Phase 2 (R8) | — |
| **Data stored in India** | Lending data kept in India | Database (Supabase) and documents (AWS S3, Textract) in Mumbai | ✅ | `docs/behind-the-scenes` |
| **Data protection** (DPDP Act 2023; core duties from about 13 May 2027) | Consent, purpose limits, security safeguards, erasure, breach reporting | Consent checkboxes; erasure on request and retention dates; PAN and mobile encrypted; row-level security on every table | ⚠️ encryption key sits in the same database (R2) | `docs/data-protection.md`, 012, 080 |
| **Audit trail** | Who did what and when, kept safe from change | 29 kinds of event logged; app users can't edit or delete | ⚠️ the database owner can; no hash chain or locked copy yet (R3). AWS CloudTrail on since 22 Oct (R4) | Audit Log page |
| **Bad-loan recognition** (90+ days past due) | Classify NPAs on time | Repayment tracking and NPA at 90+ days in the loan book | ✅ | 056, 075 |
| **Record retention** | Keep KYC and loan records for the required years | 8-year retention on documents; retention dates and an erasure queue | ✅ | 080 |
| **Reporting the lending app to RBI** | The lender reports its digital lending apps | — | 🏦 | — |
| **IT outsourcing and cyber security** | Vendor due diligence, audits, CERT-In incident report within 6 hours | — | 🏦 cercit would be audited as the vendor | — |
| **Board-approved credit policy** | The lender's board owns the credit policy | Policy rules are versioned with draft → impact test → approval → live date | 🏦 (cercit gives the mechanism) | Policy Rules page |

## What to say when asked

> cercit is designed around RBI's rules: KFS and APR in every sanction letter, reasons for every decision, a human sign-off, Aadhaar masking, data kept in India, and a full audit trail. It's a demo, so it isn't certified. Compliance belongs to the lender, and the gaps to production are listed openly in the project's fix list (section R).

## Gaps, in build order

R1 done (22 Oct) · R4 done (22 Oct) · R2 key out of the database · R3 tamper-evident audit log · R9 model governance · G10 browser-side masking · R6–R8 need partners (Phase 2) · R10 lender-side.

Sources: RBI KYC amendment of 29 May 2019 (RBI/2018-19/190) and PML Rules 9(16); RBI KYC Directions 2025 (RBI/DOR/2025-26/169); UIDAI masked-Aadhaar format; DPDP Rules notified 13 Nov 2025; RBI draft guidance on model risk management (June 2026); Governor Malhotra at FIBAC (Aug 2026). The 9 Oct checks are summarised in `docs/fix-list.md` section R.
