# Document map — what each document gives us, and how we check it

Status: draft for review, 27 Sep 2026
Scope: Phase 1 — salaried, single applicant, new car, direct leads.
Sources: PRD §10–12 (Document Intelligence, Bank Statement Intelligence, Fraud), the five extractor Lambdas in `aws/lambdas/`, and the 22-step journey comparison (Vault backlog, journey gaps).

The database design follows from this page, not the other way round. Each document below says what we **capture**, what we **analyse**, **how**, and what it **feeds**. "Today" says what the existing extractor already pulls out.

---

## The documents

| # | Document | Who provides | When | Required |
|---|---|---|---|---|
| D1 | PAN card | Customer upload | Apply | Yes |
| D2 | Aadhaar (masked copy, or offline e-KYC) | Customer upload / DigiLocker | Apply | Yes |
| D3 | Salary slips — last 3 months | Customer upload | Apply | Yes |
| D4 | Form 16 — latest year (Part A + B) | Customer upload | Apply | Yes |
| D5 | Bank statement — salary account, last 6 months | Upload PDF, later Account Aggregator | Apply | Yes |
| D6 | Credit bureau report (CIBIL) | Pulled by us, with consent | After consent | Yes (not uploaded) |
| D7 | Vehicle quotation / proforma invoice | Dealer or customer | Apply | Yes — **missing from today's apply form** |
| D8 | Address proof, if current address ≠ Aadhaar address | Customer upload | Apply | Only if different |
| D9 | Photo / selfie | Customer (camera) | KYC step | Later (with V-CIP) |
| D10 | Employment proof (ID card or appointment letter) | Customer upload | On request | Only if employer not verified |

After approval (Sanction module, later): signed KFS, loan agreement, e-mandate (NACH), insurance policy, final invoice, RC copy after registration. They are listed at the end; they do not shape the Phase 1 tables.

---

## D1 — PAN card

**Why:** identity, and the key that ties bureau, Form 16 and tax records together.

| Capture | Type | Today |
|---|---|---|
| PAN number | 10 chars `AAAAA9999A` | ✅ `pan_number` |
| Name as on PAN | text | ✅ `name` |
| Father's name | text | ✅ `father_name` |
| Date of birth | date | ❌ add |

**Analyse**
- Format check; 4th character must be `P` (individual).
- Name matches the application name (fuzzy, ≥ 85% similar) — today's `kyc_extractor` compares PAN vs Aadhaar name.
- DOB matches the application and Aadhaar.
- PAN is not already on another customer (duplicate-PAN check already exists: `uk_customers_pan_hash`).
- Later: NSDL/Protean PAN verification API (status active, name match) — backlog KY4.5.

**How:** OCR (Textract) → regex for PAN → fuzzy name match. Confidence below threshold → officer confirms the field.

**Feeds:** identity status, bureau pull (PAN is the bureau key), Form 16 cross-check, fraud (same PAN on many applications).

**Privacy:** PAN stored encrypted, shown masked (`XXXXXX234Y`) except to people with `pii.reveal` (already built, 012/018).

---

## D2 — Aadhaar

**Why:** address and a second identity proof.

| Capture | Type | Today |
|---|---|---|
| Last 4 digits only | 4 digits | ⚠ extractor reads the full `aadhaar_number` — must be cut to last 4 before storing |
| Name | text | ✅ |
| Date of birth / year of birth | date | ❌ add |
| Gender | text | ✅ |
| Address (line, city, state, PIN) | text | ✅ `address` (one block — split it) |

**Analyse**
- Name and DOB match PAN and application.
- Address state/PIN is in an operating state (hard filter: geography).
- The uploaded image must be the **masked** Aadhaar (first 8 digits hidden). If a full number is visible, mask it before storing the file.

**How:** Preferred later: offline e-KYC XML / DigiLocker (signed by UIDAI, no OCR needed). Now: OCR of the masked card.

**Feeds:** address for the case, geography rule, cross-checks.

**Privacy (hard rule):** under the Aadhaar Act a lender that is not a licensed KUA must not store the full Aadhaar number. Store last 4 digits only (`customers.aadhaar_last_four` already exists). Aadhaar OTP e-KYC has the ₹60,000 limit noted in backlog KY4.3.

---

## D3 — Salary slips (3 months)

**Why:** current take-home pay and deductions; the main income proof.

| Capture (per slip) | Type | Today |
|---|---|---|
| Pay month | month | ✅ `pay_period` |
| Employer name | text | ✅ |
| Employee name | text | ✅ |
| Employee ID, designation | text | ❌ add |
| Gross salary | ₹ | ✅ |
| Basic salary | ₹ | ✅ |
| Deductions: PF, professional tax, TDS, ESI | ₹ each | ✅ |
| Other deductions (loan recovery, advance) | ₹ | ❌ add — a salary-loan EMI hides here |
| Net pay | ₹ | ✅ |
| Bank account last 4 (if printed) | 4 digits | ❌ add |

**Analyse**
- Three consecutive, recent months (latest ≤ 45 days old).
- Net pay stable: month-to-month change ≤ 10%, else flag (bonus or cut).
- Arithmetic: gross − deductions ≈ net (± ₹10) — a mismatch suggests an edited slip.
- Employer name matches application and Form 16; employer category (A/B/C) from the employer master.
- Loan recovery on the slip → an obligation that must be in FOIR.
- **Eligible monthly income** = the lower of (average net of 3 slips, bank salary credit average).

**How:** Textract forms/tables → field mapping per employer layout; totals re-added in code, not trusted from OCR.

**Feeds:** income assessment (FOIR), employer category (rate loading, LTV cap), cross-checks with D4 and D5.

---

## D4 — Form 16 (Part A and B)

**Why:** annual income confirmed by the employer and tax department; hard to fake alongside TRACES.

| Capture | Type | Today |
|---|---|---|
| Assessment year | text | ✅ |
| Employer name, employer TAN | text | ✅ |
| Employee name, employee PAN | text | ✅ name; ❌ PAN — add |
| Gross total income | ₹ | ✅ |
| Total deductions | ₹ | ✅ |
| TDS deducted | ₹ | ✅ |
| Employment period (from–to) | dates | ❌ add |

**Analyse**
- Employee PAN = D1 PAN (exact).
- Employer TAN/name matches the salary slips' employer.
- Annual gross ÷ 12 vs slip gross: within ±15% (increments explain small gaps) — today's `cross_validator` checks this ratio.
- Employment period shows ≥ 12 months with this employer (vintage rule), or combined with total experience.

**How:** OCR; TAN by regex `AAAA99999A`. Later: TRACES verification of the certificate number.

**Feeds:** income cross-check, employment vintage, fraud (PAN mismatch).

---

## D5 — Bank statement (6 months, salary account)

**Why:** what actually reaches the account, what already goes out, and how the customer runs money.

| Capture | Type | Today |
|---|---|---|
| Bank name, account last 4, IFSC | text | partial (bank, last 4) |
| Account holder name | text | ❌ add |
| Period from–to | dates | ✅ `months` |
| Every transaction: date, description, debit, credit, balance | rows | ✅ `transactions` → `bank_transactions` table exists |

**Analyse (per month and for the 6 months)**
- Salary credits: count, amount, day of month, employer name in narration → regularity.
- EMI / NACH / ECS debits: count and amount → **existing obligations**, reconciled with the bureau (undeclared loans — already built in the engine).
- Bounces: ECS/NACH returns, cheque returns (inward/outward), bounce charges.
- Balances: average monthly balance; balance on the 5th/10th/15th/20th/25th (the table already has `amb_on_5th`…); minimum-balance breaches.
- Cash deposits: share of credits; large one-off credits just before applying (fraud signal).
- Circular transfers (money in and straight out to the same party).
- Name on the statement = applicant.

**How:** today PDF → Textract → rows → rules in code. Later: Account Aggregator (Perfios / Finbit) gives the same rows as data, with no OCR — backlog UW4.1. Categorising a transaction (salary, EMI, rent, cash) is rule-based on narration keywords first; a model only where rules miss.

**Feeds:** eligible income (bank salary), obligations (FOIR), banking behaviour score, bounce rules (1 bounce refer / 2+ decline — decision D3 of 17 Sep), fraud signals.

---

## D6 — Credit bureau report (pulled, not uploaded)

**Why:** repayment history — the strongest single risk signal.

| Capture | Type | Today |
|---|---|---|
| Score, report date, bureau | number, date | ✅ |
| Every trade line: lender, product, sanctioned, outstanding, EMI, open/close dates, DPD by month, asset classification, write-off / settled / suit flags | rows | partial — engine has `TradeLine`; database has summary columns only |
| Enquiries (date, lender, purpose) | rows | ✅ count only |
| Credit card limits and balances | ₹ | ✅ utilisation |

**Analyse:** the CIBIL red-flag matrix already built in the engine — DPD 30/60/90, SMA-0/1/2, SUB/DBT/LSS, write-off, settlement, suit, enquiries > 6 in 90 days, thin file, utilisation > 70%, plus reconciliation with declared loans and bank EMIs.

**How:** today a mock / uploaded PDF (`bureau_extractor`); later the bureau API (CIBIL/Experian) with the customer's consent recorded first.

**Feeds:** bureau layer of the decision, FOIR (bureau EMIs), fraud (undeclared loans).

**Consent:** a bureau pull needs the customer's explicit consent, stored with time and wording version (consent step, backlog KY3.1).

---

## D7 — Vehicle quotation / proforma invoice

**Why:** the loan's collateral value. Without it LTV is a guess.

| Capture | Type | Today |
|---|---|---|
| Dealer name, dealer GSTIN | text | ❌ (dealer picked by make) |
| Make, model, variant, fuel, colour | text | typed by customer |
| Ex-showroom price | ₹ | typed |
| Road tax, registration, insurance, accessories, extended warranty | ₹ each | estimated in code (6.5% / 4%) |
| On-road price | ₹ | typed |
| Quotation date, validity | date | ❌ |

**Analyse**
- Dealer is in the dealer master (132 dealers seeded) and active.
- Ex-showroom within ±5% of the OEM price list for that variant (flags inflated invoices).
- LTV = loan ÷ ex-showroom (policy basis confirmed 17 Sep), cap by CIBIL band and employer category.
- Accessories/warranty not funded beyond policy.
- Quotation not older than 30 days.

**How:** OCR of the quotation; later, dealer portal/API sends it directly.

**Feeds:** collateral layer (LTV), final sanction amount, dealer risk.

---

## D8 — Address proof (only if current address differs)

Capture: document type (utility bill, rent agreement, passport), name, address, date. Analyse: name matches, address matches the declared current address, bill ≤ 60 days old. How: OCR. Feeds: address verification.

## D9 — Photo / selfie (later, with V-CIP)

Capture: image, time, device. Analyse: face match with PAN/Aadhaar photo, liveness. How: provider API. Feeds: KYC status. Not in Phase 1.

## D10 — Employment proof (on request)

Capture: employer, employee name, ID, joining date. Analyse: matches slips; supports vintage. Used when the employer is not in the employer master or is category C.

---

## Cross-document checks

The PRD matrix, extended with what the map above adds.

| Field | Application | PAN | Aadhaar | Slips | Form 16 | Bank | Bureau | Quote | On mismatch |
|---|---|---|---|---|---|---|---|---|---|
| Name | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | < 85% similar → refer |
| Date of birth | ✓ | ✓ | ✓ | | | | ✓ | | any difference → refer |
| PAN | ✓ | ✓ | | | ✓ | | ✓ | | any difference → fraud review |
| Employer | ✓ | | | ✓ | ✓ | narration | | | different → refer |
| Monthly income | ✓ | | | net avg | gross ÷ 12 | salary credit avg | | | > 10% → refer; use the lowest |
| Existing EMIs | ✓ | | | loan recovery | | EMI debits | trade lines | | undeclared → Maybe (built) |
| Bank account | ✓ | | | last 4 | | last 4 | | | different → refer |
| Address | ✓ | | ✓ | | | | ✓ | | different → ask for D8 |
| Vehicle price | ✓ | | | | | | | ✓ | > 5% → refer |

Every check produces one of the PRD's six outcomes: match, minor difference, material mismatch, missing, unable to verify, suspected manipulation.

---

## What every document goes through (same for all)

1. Upload → file type and size check, virus scan, SHA-256 hash (duplicate across applications = fraud signal).
2. Store in S3 (Mumbai) under a random key; the database keeps only the key and hash (storage switchable — see below).
3. Classify the page (which document is this) and split multi-document PDFs.
4. Extract fields; each field saved with value, page, method, confidence.
5. Confidence below the threshold → officer confirms or corrects (logged) — backlog UW2.1/UW2.2.
6. Cross-document checks → results table.
7. Results feed the decision layers; the customer only ever sees "received / accepted / please re-upload", never scores or flags.

---

## What this means for the database (for review, not built yet)

1. **One field store for all documents** — `document_fields` (document, field name, value, page, method, confidence, confirmed by/at, corrected from). Today's `document_extractions` keeps a JSON blob; fields need their own rows so they can be confirmed one by one and audited.
2. **A document checklist per application** — `application_document_requirements` (document type, required yes/if/no, status: missing / received / accepted / rejected, reason). Drives the customer's "what's still missing" and the officer queue.
3. **Document types as data** — `document_types` (code, name, required rule, retention years, allowed file types, max size, which extractor). Adding D7 or D10 is a row, not a code change.
4. **Cross-check results as rows** — `document_checks` (check code, documents compared, values, outcome, tolerance used).
5. **Salary slips per month** — `salary_slips` (month, gross, net, deductions…) instead of one averaged row in `income_assessments`.
6. **Bureau trade lines and enquiries as rows** — `bureau_trade_lines`, `bureau_enquiries`; the summary columns stay for speed.
7. **Vehicle quotation fields** on `vehicles` (dealer GSTIN, quotation date, accessories, warranty) and a dealer match.
8. **Consents** — `customer_consents` (purpose, wording version and hash, time, channel) before any bureau pull.
9. **Storage location on each document** — `documents.storage_backend` (`s3` / `supabase` / `local`) + key, so files can move between accounts without touching anything else.
10. **Aadhaar** — only last 4 digits anywhere; the extractor must drop the rest before saving.

## After approval (Sanction module — listed, not designed yet)

Signed KFS, loan agreement (e-sign), e-mandate (NACH), insurance policy, final tax invoice, RC copy after registration (within the RC-collection window), delivery order.
