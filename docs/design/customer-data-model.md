# Customer-side data model — from the document map

Status: draft for review, 27 Sep 2026. Nothing here is built yet.
Source: `docs/design/document-map.md` (10 documents reviewed with Sameer).

Each table below says **why it exists** (which document or decision), its **main fields**, and whether it is **new**, an **extension** of a table we already have, or **kept as is**. Money in ₹, dates in IST.

Principles carried over from the map:
- Files live in S3 (Mumbai); the database holds the storage key and hash, never the file. Storage backend is a field, so files can move accounts.
- Full Aadhaar number and document passwords are never stored anywhere.
- PAN and mobile stay encrypted (012); screens show masked values unless the viewer has `pii.reveal`.
- Every extracted value keeps its source document, page, method and confidence, and can be confirmed or corrected by an officer (logged).
- The customer never sees scores, flags or check results — only document status and the decision.

---

## A. Reference data (set once, changed by admins)

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `document_types` | new | Adding a document is a row, not code | code (PAN, AADHAAR, SALARY_SLIP, FORM16_B, BANK_STMT, BUREAU, QUOTE, EB_BILL, COMPANY_ID, LIVE_PHOTO), name, when required (apply / in-principle / final / if-condition), sides (front+back), allowed sources (upload / DigiLocker / AA / API / camera), file types, max size, retention years, extractor |
| `lender_aliases` | new | Same lender, different names per bureau (D6) | alias text → canonical lender |
| `bureau_product_map` | new | Bureaus name loan types differently (D6) | bureau, bureau product name → our product type, secured yes/no, counts as card/overdraft |
| `oem_price_list` | new | Ex-showroom within ±5% check (D7) | make, model, variant, fuel, state, ex-showroom, effective from/to |
| `dealers` | kept | Dealer match (D7) | (exists; 132 dealers) |

## B. Customer and identity

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `customers` | ext | Identity (D1, D2) | add: father's name, name as on PAN, DOB source, PAN date of issue; Aadhaar last 4 only (exists) |
| `customer_addresses` | new | Aadhaar address vs current address (D2, D8) | customer, type (permanent / current / office), line fields, city, district, state, PIN, source (Aadhaar / EB bill / bureau / typed), verified yes/no, rented yes/no, owner name + contact |
| `customer_consents` | new | Consent before bureau pull, face capture, data use (D6, D9) | customer, application, purpose, wording version + hash, channel, IP, device, given at, withdrawn at |
| `kyc_records` | new | How identity was proven (D1, D2) | customer, document type, method (DigiLocker / OTP e-KYC / upload / V-CIP), provider, reference id, status, done at |
| `face_matches` | new | Live photo vs Aadhaar and PAN (D9) — built, switched off | application, live photo document, stage (apply / signing), liveness result + score, score vs Aadhaar, score vs PAN, outcome, latitude, longitude, device, IP, at |

## C. Application and documents

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `applications` | ext | Two-stage approval (D7 decision) | add: stage (in-principle / final), quote pending yes/no, channel, customer login link |
| `application_document_requirements` | new | "What's still missing" for customer and officer | application, document type, required (yes / if condition), status (missing / received / accepted / needs re-upload / waived), reason, requested at, satisfied by document |
| `documents` | ext | One row per file | add: storage backend + key, side (front / back / single), source, uploaded by (customer / staff / system), perceptual image hash (reuse check), page count, was password-protected (flag only) |
| `document_fields` | new | Every extracted value, one row each | document, field name, value (text / number / date), page, method (OCR / text / API / typed), confidence, confirmed by + at, corrected from |
| `document_authenticity_checks` | new | AI-edit / tamper checks (D1…) — built, switched off | document, check (QR vs print, metadata, pixel, font, screen photo, AI image, reuse, digital signature), result, score, detail, provider, at |
| `document_checks` | new | Cross-document matrix | application, check (name, DOB, PAN, employer, income, EMIs, account, address, price), documents compared, values, tolerance used, outcome (match / minor / material / missing / unable / suspected) |
| `document_extractions` | kept | Raw extractor output, for audit | (exists; fields move to `document_fields`) |

## D. Income (D3, D4)

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `salary_slips` | new | One row per month (3) | application, document, month, employer, employee name, employee id, designation, date of joining, DOB, PAN, UAN, PF account, gross, net, net in words matches, PF, professional tax, TDS, ESI, employer loan recovery, other deductions, loss-of-pay or arrears flag, bank + account last 4, projected taxable salary, housing-loan line present |
| `salary_slip_lines` | new | Earnings and deductions by line | slip, kind (earning / deduction), label, monthly rate, current, arrears, total |
| `form16_part_b` | new | Annual income, vintage, hidden loans | application, document, certificate no, assessment year, employer name, employer PAN, TAN, employee PAN, period from–to, other-employer salary, income under salaries, house-property income (loss = home loan), 80E amount, gross total income, taxable income, net tax, **signature valid**, signer name + designation |
| `income_assessments` | ext | Eligible income | add: slip average, bank salary average, Form 16 monthly, eligible = lower of slip and bank, rule version |

## E. Bank statement (D5)

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `bank_statement_analyses` | ext | One per statement (salary account, 6 months) | add: source (PDF / AA), holder name + match %, primary holder yes/no, joint holders, account open date, account status, IFSC, generated on, opening + closing balance |
| `bank_transactions` | ext | Every line | add: value date, channel (UPI / NEFT / IMPS / ACH / EMI / FT / IB / cash / interest / charge), category (salary / EMI / bounce / rent / insurance / investment / P2P / merchant / own transfer / other), counterparty, UPI id, is salary / is EMI / is bounce |
| `bank_monthly_summary` | new | Month-by-month view for rules | statement, month, salary credit + day, EMI debits, bounces, balance on 5th/10th/15th/20th/25th, average balance, min-balance breaches, cash deposits, large credits |

## F. Bureau (D6) — two bureaus per application

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `bureau_reports` | ext | One row per bureau pull | add: report id (ECN), pulled at, valid until (+30 days), consent, no-hit yes/no, raw response key (S3); score, date (exist) |
| `bureau_profile_items` | new | Names, phones, emails, addresses, employment on file | report, kind, value, category, date reported |
| `bureau_accounts` | new | Every loan and card | report, lender (raw + canonical), product (raw + ours), ownership, status, restructured, sanctioned, credit limit, cash limit, outstanding, overdue, EMI, frequency, monthly EMI, rate, tenure, collateral type + value, opened / payment start / last payment / closed / updated dates, last payment amount, settled, principal write-off, total write-off, suit filed, corporate card, lender licence cancelled, matched account across bureaus |
| `bureau_payment_history` | new | The month-by-month grid | account, month, days late, asset class (STD / SMA-0/1/2 / SUB / DBT / LSS) |
| `bureau_enquiries` | new | Enquiries | report, date, lender (canonical), purpose, amount |
| `bureau_summary` | new | Portfolio measures, per bureau and combined | application, bureau or COMBINED, active loans, active cards, loan balance, sanctioned, card balance, card limit, utilisation %, overdue, SMA-0/1/2 / SUB / DBT / LSS counts, worst DPD 3/6/12/24/36 m, secured / unsecured count + balance, monthly obligation (EMIs + 5% of card/overdraft), loans opened 6 m / 12 m, restructured / written-off / settled / suit counts |
| `obligation_details` | ext | Obligations used in FOIR | add: source (bureau account / bank debit / slip recovery / Form 16 / declared), link to that row |

## G. Vehicle (D7)

| Table | New / ext | Why | Main fields |
|---|---|---|---|
| `vehicle_quotations` | new | The quote, or its absence (two-stage) | application, document, customer name on quote + match %, dealer (matched) + name as printed, sales officer name + mobile, quote date, valid until, make, model, variant, colour, fuel, ex-showroom, road tax, insurance, on-road, OEM price variance % |
| `vehicles` | kept | The car the loan is for | (exists; filled from the quotation at final approval instead of estimates) |

---

## Counts

- **New tables:** 22
- **Extended tables:** 8 (`customers`, `applications`, `documents`, `income_assessments`, `bank_statement_analyses`, `bank_transactions`, `bureau_reports`, `obligation_details`)
- **Kept as is:** `dealers`, `vehicles`, `document_extractions`

## How it links (short)

customer → consents, KYC records, addresses
customer → application → document requirements → documents → fields, authenticity checks
application → salary slips (+ lines), Form 16 Part B, bank statement (+ transactions, monthly summary), bureau reports ×2 (+ profile, accounts → payment history, enquiries), bureau summary, vehicle quotation, face matches, cross-document checks, obligations

## Built in batches (proposal)

1. **Customer batch:** A, B (minus face matches), C, `vehicle_quotations` — enough for customer sign-in, apply, document checklist, status page.
2. **Bureau batch:** F with the simulated two-bureau data, lender aliases, product map, summary.
3. **Income and bank batch:** D, E.
4. **Capability batch (switched off):** `face_matches`, `document_authenticity_checks`.
