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
| D5 | Bank statement — **salary account only, last 6 months** | Upload PDF, later Account Aggregator | Apply | Yes |
| D6 | Credit bureau report (CIBIL) | Pulled by us, with consent | After consent | Yes (not uploaded) |
| D7 | Vehicle quotation / proforma invoice | Dealer or customer | Apply | Yes — **missing from today's apply form** |
| D8 | Current address proof — EB bill (+ house owner details if rented) | Customer upload | Apply | Only if current address ≠ Aadhaar |
| D9 | Live photo + face match | Customer (camera) | Right after PAN and Aadhaar; again at signing | Yes |
| D10 | Company ID card (supporting only) | Customer upload | Apply | Optional — employment judged from D3/D4/D5 |

After approval (Sanction module, later): signed KFS, loan agreement, e-mandate (NACH), insurance policy, final invoice, RC copy after registration. They are listed at the end; they do not shape the Phase 1 tables.

---

## D1 — PAN card  ✅ reviewed with Sameer, 27 Sep 2026

**Why:** identity, and the key that ties bureau, Form 16 and tax records together.

**Two ways in**
- **DigiLocker** (preferred): the PAN comes as a document issued and signed by the Income Tax Department. No tamper check is needed; the signature proves it.
- **Upload** of the physical card: **front and back both required**. The back carries little data but is needed to judge whether the card is genuine.

| Capture | Type | Today |
|---|---|---|
| PAN number | 10 chars `AAAAA9999A` | ✅ `pan_number` |
| Name as on PAN | text | ✅ `name` |
| Father's name | text | ✅ `father_name` |
| Date of birth | date | ❌ add |
| Photo (cropped from the card) | image | ❌ add — kept for a later face match with the selfie (D9) |
| Signature (cropped from the card) | image | ❌ add — compared with the signature on the loan agreement at sanction |
| Date of issue | date | ❌ add |
| Back side | image | ❌ add — authenticity only, no fields |
| Source | DigiLocker / upload | ❌ add |

**Analyse — data**
- Format check; 4th character must be `P` (individual).
- Name matches the application name (fuzzy, ≥ 85% similar) — today's `kyc_extractor` compares PAN vs Aadhaar name.
- DOB matches the application and Aadhaar.
- PAN is not already on another customer (duplicate-PAN check already exists: `uk_customers_pan_hash`).
- Later: NSDL/Protean PAN verification API (status active, name match) — backlog KY4.5.

**Analyse — is the upload genuine (AI-made or edited)?** Upload only; DigiLocker skips this.
- **QR code** (cards from 2018 on carry one): read it and compare its PAN, name, DOB with the printed text. A mismatch is the strongest sign of an edit.
- **File traces:** editing software in the file's metadata (Photoshop, Canva, AI generators), creation vs modified time, a PDF saved from an editor instead of a camera or scanner.
- **Pixel checks:** error-level analysis and noise patterns — a region pasted in (name, DOB, photo) compresses differently from the rest.
- **Font and layout:** characters in the PAN/name/DOB fields match the official card font, spacing and positions; the card template matches a known design for its issue date.
- **Photo region:** edges and lighting of the photo consistent with the card; no signs of a face swap.
- **Screen photo / screenshot:** moiré lines or screen borders mean a photo of a screen, not of the card.
- **AI-generated image:** a detector score for synthetic images.
- **Same image reused:** the file hash, and a near-duplicate image hash, compared across all applications.
- **Front and back belong together:** same card size, wear and lighting.

**Decided 27 Sep 2026:** the genuineness checks and the face match (D9) are **built and tested, then kept switched off** (feature switch) — a capability to show, not part of the demo flow.

Outcome of these checks: `clean` / `needs review` / `suspected manipulation`. Anything but clean goes to an officer; suspected manipulation opens a fraud review (PRD §12). A flag never rejects a customer on its own.

**How:** Textract OCR + regex for PAN; QR decode in code; metadata read from the file; pixel and AI-image checks from a forgery-detection service (to be chosen — the cost goes on the reconcile list). Confidence below the threshold → an officer confirms the field.

**Feeds:** identity status, bureau pull (PAN is the bureau key), Form 16 cross-check, face and signature matching later, fraud (same PAN or same image on many applications).

**Privacy:** PAN stored encrypted, shown masked (`XXXXXX234Y`) except to people with `pii.reveal` (already built, 012/018). Card images, photo and signature crops live in S3 only, never in the database.

---

## D2 — Aadhaar  ✅ reviewed with Sameer, 27 Sep 2026

**Why:** address, a second identity proof, and the best reference photo for the face match (D9).

**Three ways in**
1. **DigiLocker / offline e-KYC XML** (preferred): signed by UIDAI; carries name, DOB, gender, address and a photo. No OCR, no tamper check.
2. **Aadhaar OTP e-KYC** through a licensed provider.
3. **Upload** of the masked card, front and back.

| Capture | Type | Today |
|---|---|---|
| Last 4 digits only | 4 digits | ⚠ extractor reads the full `aadhaar_number` — must be cut to last 4 before storing (reconcile R5) |
| Name | text | ✅ |
| Date of birth / year of birth | date | ❌ add |
| Gender | text | ✅ |
| Address: house, street, locality, city, district, state, PIN | text, split | ✅ one block — split it |
| Photo | image | ❌ add — reference for the face match |
| Source | DigiLocker / OTP e-KYC / upload | ❌ add |

**Must not do:** store the full 12-digit number anywhere — files, database or logs. Under the Aadhaar Act only licensed agencies may keep it. On upload, the first 8 digits are blacked out before the file is saved.

**Analyse**
- Name and DOB match PAN and the application.
- Address state is an operating state (hard filter: geography); PIN is valid.
- Secure QR (newer cards) matches the printed details.
- Uploads get the same genuineness checks as PAN (D1).

**Limit:** Aadhaar OTP e-KYC alone caps the loan at ₹60,000 without full KYC (backlog KY4.3). For car loans the real routes are DigiLocker / offline e-KYC or video KYC.

**Feeds:** address for the case, geography rule, face match (D9), cross-checks.

---

## D3 — Salary slips (3 months)  ✅ reviewed with Sameer, 27 Sep 2026 (checked against a real payslip layout, labels only)

**Why:** current take-home pay, deductions, and a lot of employment facts the application otherwise asks the customer to type.

**Sources:** upload (PDF, often password-protected — ask for the password, never store it; photo accepted). Later: payroll/HRMS link for large employers.

A real employer payslip (a large NBFC's "Form T" pay slip / leave card) carries more than the first draft listed. Fields now in three blocks:

**Header — who and where**

| Capture | Type | Today | Use |
|---|---|---|---|
| Employer name and address | text | ✅ name | employer match, category |
| Statutory form (e.g. "Form T" wage slip) | text | ❌ | genuineness: expected template for the employer's state |
| Pay month | month | ✅ | recency, 3 consecutive months |
| Employee name | text | ✅ | name match |
| Employee ID | text | ❌ | same on all 3 slips |
| Date of joining | date | ❌ | **employment vintage** directly — no need to ask |
| Date of birth | date | ❌ | cross-check with PAN / Aadhaar |
| PAN | text | ❌ | cross-check with D1 |
| UAN and PF account number | text | ❌ | formal employment; later EPFO check |
| ESI number (if any) | text | ❌ | ESI applies to lower wages — a consistency check |
| Designation, department, location | text | ❌ | profile; location vs address |

**Earnings and deductions — per line, with rate, current month, arrears/adjustments, total**

| Capture | Type | Today | Use |
|---|---|---|---|
| Earnings lines (basic, HRA, allowances…) with monthly rate and amount paid | ₹ rows | partial (basic, gross) | fixed pay vs one-offs |
| Arrears / adjustments column | ₹ | ❌ | **excluded** from regular income |
| Deduction lines (PF, professional tax, TDS, ESI…) | ₹ rows | ✅ main ones | formal employment, tax |
| **Employer loan recoveries** (principal and interest lines, e.g. staff car/consumer loans) | ₹ | ❌ | **existing EMI** → FOIR, even if not on the bureau |
| Total earnings, total deductions | ₹ | ✅ gross | arithmetic check |
| Net pay in figures **and in words** | ₹, text | ✅ figure | words must equal the figure (edit check) |
| Bank name and account (partly shown) | text | ❌ | same account as the bank statement (D5) |

**Tax projection block (when printed)**

| Capture | Type | Use |
|---|---|---|
| Projected gross salary, exemptions, taxable salary for the year | ₹ | annual income cross-check with Form 16 |
| Chapter VI-A deductions (80C, 80D…), housing-loan principal/interest | ₹ | a housing-loan line means an existing home loan → check it is in the bureau and FOIR |
| Total tax, tax recovered so far, tax to pay | ₹ | TDS consistency |

**Analyse**
- 3 consecutive months, latest within 45 days; employee ID and template identical on all three.
- Net pay steady: month-to-month change within 10%.
- **Flag, not explain:** any loss-of-pay or arrears in the 90-day sample is raised as a flag for the officer. Day counts are not captured — the sample is recent and short, so the officer looks at it directly.
- Arithmetic: sum of earnings = total earnings; total earnings − total deductions = net pay (± ₹10); net in words = net in figures.
- Employer matches the application, Form 16 and the bank salary narration; employer category (A/B/C) from the employer master.
- Employer loan recoveries and a housing-loan line in the tax block → obligations; reconciled with the bureau and bank EMIs.
- PAN and DOB on the slip match D1 / D2; date of joining gives vintage.
- **Eligible monthly income** = the lower of (average regular net pay of 3 slips, bank salary credit average).

**Genuineness:** same checks as PAN (D1) — metadata, pasted areas, fonts, AI-image score — plus: same template across all three months, words-vs-figures match, and the statutory form expected for the employer. "Computer generated, no signature" is normal and not a flag.

**How:** Textract tables → map earnings and deductions lines by label (a dictionary of common line names per employer, grown over time) → all totals re-added in code, never trusted from OCR.

**Feeds:** income assessment (FOIR), vintage and employer category (rate loading, LTV cap), obligations, cross-checks with D1, D2, D4 and D5.

---

## D4 — Form 16 Part B (latest year)  ✅ reviewed with Sameer, 27 Sep 2026 (checked against a real Part B layout, labels only)

**Why:** a full year of salary certified by the employer, with the tax worked out — hard to fake because it is digitally signed.

**Decided:** ask for **Part B only**. Part A (quarterly TDS deposits from TRACES) is not requested.

**Source:** upload of the employer's PDF (sometimes password-protected — ask, never store). Later: the income tax return (ITR) or the Annual Information Statement as an alternative.

| Capture | Type | Use |
|---|---|---|
| Certificate number (printed on every page) | text | same on all pages; the key for a later TRACES check |
| Last updated date | date | recency |
| Employer name and address, employer PAN, **TAN** | text | employer match with slips and bank narration |
| Employee name and address, **employee PAN** | text | PAN = D1 exactly; address vs D2 |
| Assessment year; **period with the employer** from–to | text, dates | a partial year means joined mid-year → vintage |
| Opted out of the new tax regime (section 115BAC) | yes/no | explains the deduction pattern |
| Gross salary: salary, perquisites, profits in lieu of salary, total | ₹ | annual income |
| **Salary received from other employers** in the same year | ₹ | non-zero = changed jobs during the year → vintage flag |
| Exemptions (HRA, travel, leave encashment, gratuity, other) | ₹ | net vs gross understanding |
| Standard deduction, professional tax | ₹ | |
| Income under "Salaries" | ₹ | **annual salary for the cross-check** |
| Income from house property reported | ₹ | **a loss here = home-loan interest → an existing home loan** |
| Other income reported | ₹ | |
| Gross total income; Chapter VI-A deductions (80C, 80CCD, 80D, **80E education-loan interest**, 80G, 80TTA…) | ₹ | 80E → an existing education loan |
| Taxable income, tax, rebate, surcharge, cess, relief, **net tax payable** | ₹ | tax consistency with the slips' tax block |
| Verification: signatory name, designation, place, date | text, date | authorised person (usually HR / finance head) |
| **Digital signature** | signed PDF | the strongest genuineness check |

**Analyse**
- Employee PAN = D1 PAN (exact). Employer and TAN match the salary slips.
- Income under "Salaries" ÷ months in the employment period, compared with slip gross: within ±15% (raises and bonuses explain small gaps).
- Period with employer + salary from other employers → vintage: at least 12 months with this employer, or flag a recent job change.
- House-property loss (home-loan interest) and 80E (education-loan interest) → loans that must appear in the bureau and in FOIR; missing from the bureau = flag.
- Net tax payable consistent with the tax projection on the latest slip.

**Genuineness**
- **Digital signature valid** and made by the employer's signing certificate; any edit after signing breaks it. Valid signature = no pixel or font checks needed.
- Certificate number identical on every page; layout matches the standard Form 16 Part B template.
- Unsigned or broken signature → the same edit checks as PAN (D1), and the officer is told.

**How:** read the PDF text directly (it is a generated PDF, not a scan — no OCR needed); verify the signature in code; map lines by their section numbers, which are fixed by the form.

**Feeds:** income cross-check, vintage, hidden obligations (home and education loans), fraud (PAN mismatch, broken signature).

---

## D5 — Bank statement  ✅ reviewed with Sameer, 27 Sep 2026

**Decided:** **6 months, salary account only.**

**Sources**
1. **Account Aggregator** (Perfios / Finvu / OneMoney) — the customer approves in their bank app; data arrives directly, cannot be edited (later, backlog UW4.1).
2. **Upload** of the bank's e-statement PDF (usually password-protected — ask, never store).
3. Netbanking-login fetch — **not used**: it means handling the customer's bank password.

**Not accepted as proof:** a spreadsheet export (.xls / .csv) from netbanking. It is easy to edit and carries no bank signature. Accept the bank's PDF e-statement or Account Aggregator data. (Checked against a real netbanking export, structure only, 27 Sep 2026.)

**Capture — header**

| Field | Type | Today |
|---|---|---|
| Bank, branch, IFSC | text | partial (bank) |
| Account number (last 4 kept), account type | text | ✅ last 4 |
| **Account holder name**, address | text | ❌ add |
| Statement period, opening and closing balance | dates, ₹ | partial (months) |
| **Account open date** | date | ❌ add — an account opened in the last 6 months is a flag (new salary account, or opened for this application) |
| **Account status** | text | ❌ add — must be active, not dormant or frozen |
| **Joint holders** | text | ❌ add — applicant must be the primary holder; a joint holder's credits are not the applicant's income |
| Customer ID, nomination | text | ❌ add (profile only) |
| Phone and email on the account | text | ❌ add — match the application |
| Statement generated on | date | ❌ add — within 7 days of upload |

**Capture — every transaction:** date, **value date**, narration, cheque/reference number, debit (withdrawal), credit (deposit), running (closing) balance (`bank_transactions` table exists; add value date).

**Narration formats to parse** (seen in a real statement): **UPI** is by far the most common line — its narration carries the other party's name, UPI ID, bank and a remark, and must be split into those parts to tell person-to-person transfers from merchant payments. Others: NEFT, IMPS, RTGS, **ACH** (NACH debits — EMIs, SIPs, insurance), **"EMI"** (a loan or card EMI from the **same bank**, which never shows as ACH), FT / IB (internal and internet-banking transfers — a salary from an employer banking with the same bank can arrive as FT), interest credits, depository / demat charges (investments), card and alert charges.

**Sort each transaction:** salary · EMI / NACH / ECS · bounce or return · bounce charge · cash deposit · cash withdrawal · UPI in / out · credit card payment · rent · insurance · investment (SIP, RD) · loan disbursement received · transfer to own account · other. Rules on narration keywords first; a model only where rules miss.

**Analyse**
- **Income:** salary credits in 6 of 6 months; employer name in the narration; same day of month (± 3 days); amount steady. Average salary credit vs the slips' net pay.
- **Obligations:** every regular EMI/NACH **and same-bank "EMI" debit** — lender, amount, day — matched with the bureau and declared loans (undeclared-loan detection already built).
- **Behaviour:** bounces (1 → refer, 2+ → decline — rule of 17 Sep); balance on the 5th/10th/15th/20th/25th; average monthly balance; days below minimum balance; cash deposits as a share of credits; **large credits just before applying**; money in and straight back out (circular).
- **Genuineness:** PDF e-statement or Account Aggregator only; account holder = applicant (primary); running balance adds up on every line (one edited amount breaks it); each month's opening balance = previous closing; bank's template and PDF metadata; salary account = the account printed on the salary slip.

**Feeds:** eligible income (bank side), FOIR obligations, bounce rules, banking behaviour score, fraud signals.

---

## D6 — Credit bureau report (pulled by API, not uploaded)  ✅ reviewed with Sameer, 27 Sep 2026

**Why:** repayment history — the strongest single risk signal.

**Sources — decided 27 Sep 2026: at least two bureaus (industry practice).** **CIBIL** plus one of Experian, Equifax or CRIF High Mark. Pulled by us after consent; never uploaded by the customer. Until bureaus are connected: **simulated and labelled** (reconcile R7).

**Combining two reports**
- **Score band:** from CIBIL (the band table is set on CIBIL); the second score is shown and a gap of more than 50 points is flagged.
- **Loans:** the union of both reports, with the same loan matched across bureaus (lender + type + opened date + sanctioned amount) so it is counted once.
- **Bad marks** (DPD, SMA/SUB/DBT/LSS, write-off, settled, suit): **the worse of the two** applies. A bad mark on one bureau only is still a bad mark.
- **Enquiries:** union, de-duplicated by lender and date.
- A loan or bad mark found on one bureau and not the other is shown to the officer as a bureau difference.

**Consent:** explicit tick with wording version, time and IP, **before** the pull; kept for audit (backlog KY3.1).

**Source format:** structured data from each bureau's **API** (the lender's commercial report), never a PDF. The consumer reports were read only to learn the fields and how bureaus differ.

**Not accepted:** a report the customer downloads and uploads (consumer "credit health" copies from bureau or app websites). They come in many layouts and are easy to alter. Only our own pull counts. A pull is valid for **30 days**; older → pull again.

**What four real reports for one person showed (structure only, 27 Sep 2026)**
- **The bureaus do not hold the same loans.** One bureau listed loans another did not; one bureau classed a personal loan as "microfinance personal loan". This is why two bureaus are pulled and combined.
- **Lender names differ by bureau** (short name vs full legal name vs a bank's registered foreign name). Loans can only be matched across bureaus after **lender-name normalisation** (the engine already normalises lender names for reconciliation; extend it with a lender alias table).
- **Product types differ by bureau** — overdraft, consumer loan, education loan, personal loan, credit card, corporate credit card, microfinance personal loan, others. Map every bureau's names to our own product list.

| Capture | Type | Today |
|---|---|---|
| Score, report date, bureau, control number | number, date, text | ✅ score, date |
| Name, DOB, PAN, addresses and phones on file | text | ❌ add |
| Report identifier (CIBIL ECN or the bureau's equivalent) | text | ❌ add — needed to raise a dispute |
| Profile: name variants, gender, DOB, PAN, emails | text | ❌ add |
| Phones with type (mobile / office / not classified) and addresses with category (permanent / residence / office) and date reported | rows | ❌ add |
| Employment details on file | text | ❌ add |
| Every loan: lender, product type, account number (masked), ownership (individual/joint), **account status**, sanctioned amount, **credit limit, cash limit**, current outstanding, **overdue amount**, EMI, **payment frequency** (monthly / bimonthly…), **rate of interest**, **repayment tenure**, **type and value of collateral**, opened / payment start / last payment / closed / last updated dates, **last payment amount**, **settled amount, principal write-off, total write-off**, **suit-filed status**, **payment history grid month by month (days late, STD / SMA / SUB / DBT / LSS)** | rows | partial — engine has `TradeLine`; database has summary columns only |
| Closed accounts with the same fields | rows | ❌ add |
| Bureau summary: on-time payment %, card limit used %, age of oldest account, total enquiries, unsecured account count, score trend | numbers | ❌ add (shown to the officer; rules use the account rows) |

**Portfolio summary — worked out from the account rows, per bureau and for the combined view** (asked for by Sameer)

| Measure | Use |
|---|---|
| Number of active accounts — loans and cards separately | exposure, credit-hungry pattern |
| **Total active loan balance** (outstanding) and total sanctioned | exposure |
| **Total active card balance** and total card limit → utilisation % | FOIR (card obligation), utilisation rule |
| Total overdue amount | overdue rule |
| **SMA flags** — number of accounts currently SMA-0 / SMA-1 / SMA-2, and SUB / DBT / LSS | bureau rules |
| Worst DPD in the last 3 / 6 / 12 / 24 / 36 months | DPD rules |
| Secured vs unsecured — count and balance | credit mix |
| Total monthly EMI (after frequency conversion) + card and overdraft obligation | FOIR |
| Loans opened in the last 6 and 12 months | credit-hungry flag |
| Restructured, written-off, settled, suit-filed — counts | hard filters |
| Enquiries: date, lender, purpose, amount | rows | ✅ count only |
| Credit card limits and balances | ₹ | ✅ utilisation |

**Analyse — already built in the engine:** DPD 30/60/90, SMA-0/1/2, SUB/DBT/LSS, write-off, settlement, suit, enquiries > 6 in 90 days, thin file (< 12 months), card utilisation > 70%, undeclared loans vs declared and bank EMIs.

**Analyse — new**
- **Restructured accounts** (for example "restructured due to COVID-19") → flag; a restructure means the borrower could not pay as agreed.
- **Overdue amount above zero** on any active account → flag (threshold to be set in policy).
- **Many small loans from digital lenders** opened and closed within months → credit-hungry pattern flag (count opened in the last 6 and 12 months).
- A loan reported by a lender whose **licence was cancelled** → the record may be stale; treat as a data issue for the officer, not as a bad mark.
- **Obligations for FOIR:** EMI converted to monthly using the payment frequency; **credit cards and overdrafts** have no EMI → count 5% of the outstanding (industry norm, to be confirmed in policy); **corporate credit cards** are the company's liability → shown, not counted.
- An **office address** on file that is the employer's address → supports the employment claim.
- PAN, DOB and name on the report match D1 and D2.
- Addresses and phones on file vs the application; **many different addresses or phones = identity flag**.
- A car-loan enquiry from another lender in the last 30 days = shopping around, or a second loan on the same car.

**Decided 27 Sep 2026**
1. Card and overdraft obligation for FOIR: **5% of the outstanding**.
2. A customer with **no bureau record on both bureaus → reject** (changes the 17 Sep "missing reports refer" rule for bureau no-hit — goes through policy change; reconcile R11).

~~Earlier open question:~~ a customer with **no bureau record** (new to credit) — reject, refer to an officer, or allow with a lower LTV? Until decided: **refer** (the existing "missing reports refer" rule, decision D6 of 17 Sep).

**Feeds:** bureau layer of the decision, FOIR (bureau EMIs), fraud.

---

## D7 — Vehicle quotation / proforma invoice  ✅ reviewed with Sameer, 27 Sep 2026

**Why:** the loan's collateral value. Without it LTV is a guess. Missing from today's apply form (reconcile R6).

**Sources:** the dealer, or the customer uploading what the dealer gave them. Later: the dealer system sends it directly.

**Capture (Sameer's list)**

| Field | Type | Today |
|---|---|---|
| Customer name on the quote | text | ❌ |
| Dealer name | text | dealer picked by make |
| Issuing sales officer — name and mobile | text | ❌ |
| Date of quotation and validity (valid-until date or days) | dates | ❌ |
| Car make, model, variant | text | typed by customer |
| Colour, fuel type | text | fuel only |
| Ex-showroom price | ₹ | typed |
| Road tax | ₹ | estimated in code (6.5%) — replace with the quote |
| Insurance | ₹ | estimated in code (4%) — replace with the quote |

**Analyse**
- **Customer name on the quote matches the applicant at 60% or more** (a lower bar than identity documents: dealers type names loosely). Below 60% → refer.
- Quote is still valid on the application date (date + validity).
- Dealer is in the dealer master (132 dealers seeded) and active.
- Make, model and variant exist for that make; ex-showroom within ±5% of the OEM price list for the variant (flags inflated quotes).
- On-road = ex-showroom + road tax + insurance (+ any other lines shown); **LTV** = loan ÷ ex-showroom (policy basis agreed 17 Sep).
- Sales officer's mobile is not the applicant's own mobile (a self-made quote).

**Genuineness:** the same edit checks as other uploads; dealer name matches the dealer master.

**Feeds:** collateral layer (LTV), final loan amount, dealer risk, and later the payment to the dealer and the contact for delivery follow-up.

**Decided 27 Sep 2026 — two stages.** Most customers apply after a test drive and already have the quote: they upload it with the application. If they do not, the application goes ahead without it and gets an **in-principle approval** (LTV on the price they typed); the officer asks for the quote, and **final approval needs it**. The quote's figures then replace the typed ones and the rules run again.

---

## D8 — Current address proof (only if current address ≠ Aadhaar)  ✅ reviewed with Sameer, 27 Sep 2026

**Accepted:** the **electricity (EB) bill**. For a rented house, the EB bill in the owner's name **plus the house owner's details** (rent agreement or owner's name and contact) is enough.

| Capture | Type |
|---|---|
| Bill: consumer name, service address, bill date, electricity board | text, date |
| Rented: owner's name and contact, rent agreement if given | text |
| Own / family house: relation to the bill holder | text |

**Analyse:** service address = declared current address; bill up to 60 days old; bill name = applicant, family member or the named owner; declared rent (if any) counted in expenses.

**How:** OCR of the bill. **Feeds:** address verification.

---

## D9 — Live photo and face match  ✅ agreed with Sameer, 27 Sep 2026 — moved into Phase 1

**Why:** proves the person applying is the person on the PAN and Aadhaar — stops someone applying with another person's documents.

**When:** straight after PAN and Aadhaar are in (so the reference photos exist), in the same session. Taken again at signing (Sanction) to confirm the same person signs.

| Capture | Type |
|---|---|
| Live photo from the phone or laptop camera (no gallery upload) | image, S3 only |
| Liveness result (blink / head turn, or a passive liveness score) | pass / fail + score |
| Time, device, IP, location (latitude/longitude, must be in India) | text / numbers |
| Match score: live photo vs Aadhaar photo | 0–100 |
| Match score: live photo vs PAN photo | 0–100 |
| Consent to capture and compare the face | yes + time + wording version |

**Analyse**
- Liveness first: a photo of a photo, a screen or a mask fails.
- Face match against **Aadhaar** (primary — DigiLocker photos are clear) and **PAN** (secondary — PAN photos are often small and years old, so a lower score is expected).
- Outcome: both clear the threshold → match; one borderline → officer compares by eye; clear mismatch → fraud review. A mismatch never rejects on its own.
- Same face on another applicant's documents → fraud signal.

**How:** a face-match and liveness service (provider to be chosen — reconcile R10). The camera is opened by the page; gallery upload is not offered.

**Privacy:** face images are personal data under the DPDP Act: explicit consent, used only for this check, kept for the retention period, then deleted. Store the images and scores — not face templates (embeddings).

---

## D10 — Employment proof  ✅ reviewed with Sameer, 27 Sep 2026

**Decided:** no separate employer verification — industry practice does not do it. Employment is judged from the **recent salary slip** (D3: employer, employee ID, date of joining, PF/UAN) together with Form 16 and the bank salary credits. A **company ID card** is accepted as supporting proof where available (optional).

| Capture (ID card, if given) | Type |
|---|---|
| Employer, employee name, employee ID, photo | text, image |

**Analyse:** employee ID and employer match the salary slip; photo can join the face match (D9).

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
