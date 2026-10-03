# How a loan moves through cercit: the flow charts

One chart per stage, in the order a loan goes through them. Each shows who acts (customer, system, officer, manager or head), what is checked and the possible outcomes; the table under it names the screen and the database function for each step. Function names link to their description in [functions.md](functions.md).

[← Back to the overview](README.md)

- [1. Customer onboarding (steps 1–4)](#1-customer-onboarding-steps-14)
- [2. Documents and automatic checks](#2-documents-and-automatic-checks)
- [3. Bureau and income checks](#3-bureau-and-income-checks)
- [4. Policy engine and risk model](#4-policy-engine-and-risk-model)
- [5. Officer decision: in principle, then final](#5-officer-decision-in-principle-then-final)
- [6. Offer, agreement and mandate](#6-offer-agreement-and-mandate)
- [7. Disbursal](#7-disbursal)
- [8. Repayments, late payments and NPA](#8-repayments-late-payments-and-npa)
- [9. The daily simulation](#9-the-daily-simulation)
- [10. Changing the credit policy or the prices](#10-changing-the-credit-policy-or-the-prices)

Colours: blue = customer, green = system (database or AWS), orange = staff, grey = an outcome.

---

## 1. Customer onboarding (steps 1–4)

The customer applies on the website in four steps. Every read and write goes through a database function that only ever touches the customer's own draft; a staff login can't apply as a customer.

```mermaid
flowchart TD
  classDef cust fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  S1["Customer: name, mobile, email"]:::cust --> V1{"Mobile code (simulated) and email code (real) entered?"}:::sys
  V1 -- no --> R1["Asked again"]:::out
  V1 -- yes --> D1["Draft application created"]:::sys
  D1 --> S2["Customer: the car, from the dealer's quotation or typed in"]:::cust
  S2 --> S3["Customer: documents (live photo, PAN, Aadhaar, salary slips, bank statement, Form 16)"]:::cust
  S3 --> S4["Customer: personal, address and work details, pre-filled from the documents, confirmed"]:::cust
  S4 --> C1{"Every group confirmed, every needed document in, credit-check consent, fresh email code?"}:::sys
  C1 -- no --> R2["Submit stays closed, the page says what is missing"]:::out
  C1 -- yes --> SUB["Submitted: the case goes to the officers' queue"]:::sys
  SUB --> T["Customer follows it on the tracking page"]:::cust
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Start, codes | Customer | Apply → sign-in | `fn_customer_start` |
| Car | Customer | Onboarding: car | `fn_customer_save_vehicle` |
| Documents | Customer, AWS upload service | Onboarding: documents | `fn_customer_can_upload`, `fn_customer_register_document`, `fn_document_upload_types` |
| Details | Customer | Onboarding: details | `fn_customer_details`, `fn_customer_save_details` |
| Consent and submit | Customer | Onboarding: details | `fn_consent_text`, `fn_customer_submit` |
| Tracking | Customer | Application status | `fn_customer_track` |

## 2. Documents and automatic checks

Each file goes to the AWS document service, which reads it and saves what it read. Rules (not people) then check each document; what is checked, whether it blocks and what happens on a fail are settings on the Document checks page.

```mermaid
flowchart TD
  classDef cust fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef staff fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  U["Customer uploads a file"]:::cust --> F["AWS: unlocks password-protected files, masks the Aadhaar number, files it"]:::sys
  F --> RD["AWS readers: Textract and Rekognition read the fields, match the live photo with the PAN and Aadhaar photos"]:::sys
  RD --> SAVE["Database: readings and face match saved"]:::sys
  SAVE --> CHK{"Checks per document: whole, readable, PAN, name, date of birth, face, address, employer, salary, recent"}:::sys
  CHK -- "all blocking checks pass" --> ACC["Accepted on its own"]:::out
  CHK -- "a blocking check fails" --> FAIL{"What the rule says on a fail"}:::sys
  FAIL -- "a person looks" --> OFF["Officer: accept, or ask again with a reason"]:::staff
  FAIL -- "ask the customer again" --> AGAIN["Customer uploads again"]:::cust
  OFF --> ACC
  ACC --> ALL{"Every needed document accepted?"}:::sys
  ALL -- yes --> NEXT["Case moves to the credit check by itself"]:::out
```

| Step | Who | Screen | Database function / service |
|---|---|---|---|
| Upload link, finalise | AWS | — | Lambdas `presigned_url`, `document_finalize` |
| Reading | AWS | — | Lambdas `kyc_extractor`, `salary_slip_extractor`, `bank_statement_extractor`, `form16_extractor`, `bureau_extractor`, `cross_validator`; `fn_record_document_reading`, `fn_record_face_match` |
| Checks | System | Document checks (settings) | `fn_auto_review_documents`, `fn_doc_check` |
| A person looks | Officer | Customer applications → case | `fn_staff_customer_action` (ACCEPT_DOC, REQUEST_DOC) |

## 3. Bureau and income checks

```mermaid
flowchart TD
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef staff fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  GO["Documents verified (automatic or by the officer)"]:::staff --> CAR["Car details copied from the quotation"]:::sys
  CAR --> BUR["Bureau pull: CIBIL plus one other (simulated; same PAN, same report)"]:::sys
  BUR --> COMB["Combined: CIBIL's score, worse of the two for bad marks, a loan on both counted once, obligation = EMIs + 5% of card balances"]:::sys
  GO --> INC["Income: salary slips, Form 16, bank month summary from the readers"]:::sys
  INC --> BANK["Bank: salary credits, bounces, balances on 5 dates, EMI debits"]:::sys
  COMB --> ENG["To the policy engine"]:::out
  BANK --> ENG
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Run the checks | System, or officer ("Run credit checks") | Customer applications → case | `fn_staff_customer_run_checks` |
| Bureau | System | Application Review → Bureau | `fn_bureau_pull_simulated`, `fn_bureau_combine` |
| Income and bank | System | Application Review → Income | `fn_reading_summary`, `fn_record_income_detail` |

## 4. Policy engine and risk model

The decision is worked out in the database from the credit rules in force; the risk model gives a second opinion. Every recommendation is stamped with the policy version, the rules and the model used, so it can be explained later.

```mermaid
flowchart TD
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  IN["Bureau, income, bank, car, employer"]:::sys --> CAT["Employer category A, B or C (Employer Master)"]:::sys
  CAT --> PRICE["Rate = band rate for the bureau score + category loading (rate grid in force)"]:::sys
  PRICE --> RULES{"Every active credit rule: score, late payments, write-offs, enquiries, FOIR at the priced rate, LTV, age, tenure, bounces, salary regularity"}:::sys
  RULES -- "a hard rule fails" --> DEC["Decline"]:::out
  RULES -- "a soft rule fails, above the category LTV cap, caution list, payslip employer mismatch, no score" --> REF["Refer to a person"]:::out
  RULES -- "all pass" --> APP["Approve: amount, rate, tenure, EMI, fee"]:::out
  IN --> ML["Risk model v2: 18 inputs from the bureau and bank detail, chance of going 90+ days late, grade"]:::sys
  ML --> SHOW["Shown on the case screen next to the engine's answer"]:::out
```

| Step | Who | Screen | Database function / code |
|---|---|---|---|
| Assessment | System | Application Review | `fn_assess_application` |
| Rules | System | Policy Rules (the rules) | `fn_run_policy_engine` |
| Recommendation | System | Application Review → Overview | `fn_generate_recommendation`, `fn_case_employer_category` |
| Same rules on AWS (switchable) | AWS policy engine | — | Lambda `policy_engine`, `fn_policy_facts`, `fn_engine_decision_record` |
| Risk score | Browser (ONNX model) | Application Review → ML risk card | `fn_staff_risk_features`; `src/lib/onnx-inference.ts` |

## 5. Officer decision: in principle, then final

A case is approved twice: in principle on the customer's documents, then finally once the dealer's quotation is in. A person always decides; deciding against the engine needs a reason and is logged as an override.

```mermaid
flowchart TD
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef staff fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  Q["Case in the queue (officers see their own and unassigned cases; managers and above see all)"]:::staff --> TAKE["Officer takes the case"]:::staff
  TAKE --> LOOK["Officer reads the recommendation, the checks, the documents"]:::staff
  LOOK --> D{"Decision"}:::staff
  D -- "approve" --> LIM{"Within the officer's daily case limit and sanction limit?"}:::sys
  LIM -- no --> UP["Refused: a manager or head decides"]:::out
  LIM -- yes --> IP["Approved in principle"]:::out
  D -- "refer" --> MGR["Manager or head reviews (can override)"]:::staff
  D -- "reject" --> REJ["Rejected, with reasons"]:::out
  D -- "against the engine" --> OVR["Override: reason required, logged"]:::sys
  IP --> QUOTE["Customer sends the dealer's quotation"]:::staff
  QUOTE --> FIN["Final check and final approval"]:::out
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Queue | Officer, manager | Applications, Customer applications | `fn_list_applications_page`, `fn_staff_customer_queue`, `fn_staff_case_scope` |
| Take, decide | Officer | Customer applications → case | `fn_staff_customer_action` (ASSIGN_TO_ME, DECIDE, MOVE_TO_FINAL) |
| Decide (staff-entered cases) | Officer, manager | Application Review | `fn_officer_decision` |
| Limits | System | Users (limits per user) | `fn_check_officer_limits` |

## 6. Offer, agreement and mandate

```mermaid
flowchart TD
  classDef cust fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef staff fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  FA["Final approval"]:::out --> OFFER["Officer issues the offer: sanction letter and Key Facts Statement (valid 3 working days)"]:::staff
  OFFER --> ACC{"Customer accepts the KFS they saw, with an email code?"}:::cust
  ACC -- "no, or expired" --> LAPSE["Offer lapses"]:::out
  ACC -- yes --> AGR["Agreement made from a frozen copy of the offer"]:::sys
  AGR --> SIGN["Customer signs: typed name and email code (Aadhaar eSign in production)"]:::cust
  SIGN --> MAN["Customer sets up EMI auto-debit (e-NACH, simulated)"]:::cust
  MAN --> PAP["Customer sends dealer papers: down-payment receipt, invoice, insurance"]:::cust
  PAP --> OK["Officer accepts each paper"]:::staff
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Offer | Officer | Application Review → after approval | `fn_staff_issue_offer` |
| Accept, sign, mandate | Customer | My loan | `fn_customer_after_approval`, `fn_customer_accept_offer`, `fn_customer_sign_agreement`, `fn_customer_set_mandate` |
| Papers | Customer, officer | My loan; case screen | `fn_customer_register_document`, `fn_staff_customer_action` (ACCEPT_DOC); the officer's view: `fn_staff_after_approval` |

## 7. Disbursal

```mermaid
flowchart TD
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef staff fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  READY{"Agreement signed, mandate set, dealer papers accepted?"}:::sys
  READY -- no --> WAIT["Refused, with the list of what is missing"]:::out
  READY -- yes --> PAY["Officer disburses to the dealer"]:::staff
  PAY --> ACCT["Loan account and repayment schedule created (first EMI on the 5th, at least 15 days away)"]:::sys
  ACCT --> DOCS["Disbursement advice, schedule and welcome letter for the customer"]:::sys
  ACCT --> RC["RC with the lender's hypothecation asked for"]:::out
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Disburse | Officer (app.decide) | Application Review → after approval | `fn_staff_disburse` |
| Letters | Website | My loan, case screen | `src/lib/doc-pdf.ts` from `fn_after_approval_data` |

## 8. Repayments, late payments and NPA

A payment can arrive in several attempts; an instalment is cleared on the day the money adds up to the amount due (a shortfall under ₹100 is not a delay). Days late is the gap between the due date and that day.

```mermaid
flowchart TD
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  DUE["EMI due on the 5th"]:::sys --> DEBIT{"Mandate debit"}:::sys
  DEBIT -- paid --> CUR["Current"]:::out
  DEBIT -- bounced --> LATER{"Paid later?"}:::sys
  LATER -- "1–30 days" --> B1["1–30 days past due"]:::out
  LATER -- "31–60 days" --> B2["31–60 days past due (SMA-1)"]:::out
  LATER -- "61–90 days" --> B3["61–90 days past due (SMA-2)"]:::out
  LATER -- "not within 90 days" --> NPA["90+ days: NPA"]:::out
  CUR --> SNAP["Stored loan status refreshed when a payment arrives"]:::sys
  B1 --> SNAP
  B2 --> SNAP
  B3 --> SNAP
  NPA --> SNAP
  SNAP --> PORT["Loan portfolio: buckets, PAR 30, bounce rate, vintages"]:::out
  SNAP --> RULES["Credit rules on repeat customers read the same history"]:::out
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Status per instalment | System | — | `fn_loan_installment_status` |
| Stored status | System | — | `fn_mark_loan_stale`, `fn_loan_status_refresh` |
| Portfolio | Manager, head | Loan portfolio, Dashboard | `fn_staff_loan_portfolio`, `fn_staff_dashboard` |

## 9. The daily simulation

So the demo's book keeps moving, a job runs every morning at 06:00 India time on synthetic data only. **Remove before real use** (`docs/production-checklist.md`).

```mermaid
flowchart TD
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  CRON["pg_cron 06:00 IST: cercit-simulation-daily"]:::sys --> ON{"simulation_enabled?"}:::sys
  ON -- no --> STOP["Nothing happens"]:::out
  ON -- yes --> CATCH["Catches up missed days (up to 31)"]:::sys
  CATCH --> LEADS["10 synthetic leads through the real checks and engine"]:::sys
  LEADS --> DISB["The day's approved cases disbursed"]:::sys
  DISB --> PAYS["The day's instalments: paid, bounced then paid, 31–60 days late, or stopped (weaker profiles 3x as often)"]:::sys
  PAYS --> CLOSE["Paid-up loans closed, portfolio refreshed"]:::sys
  CLOSE --> DUE["Due policy versions and rate grids made live, employer list topped up"]:::sys
  DUE --> PR["Practice cases reset"]:::sys
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| The run | pg_cron | Dashboard (recent days) | `fn_sim_daily`, `fn_sim_leads`, `fn_sim_disburse_day`, `fn_sim_payments_day`, `fn_sim_recent_days` |
| The generator | System | — | `fn_synthetic_generate`, `fn_synthetic_disburse` |
| Practice reset | System | — | `fn_practice_reset` |

## 10. Changing the credit policy or the prices

Nobody changes a rule or a price alone: one person drafts, another approves with a start date, and the change goes live on that date. Old versions stay, so every past decision can be explained by the version it was made under.

```mermaid
flowchart TD
  classDef staff fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef sys fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef out fill:#f3f4f6,stroke:#6b7280,color:#111827

  AUTH["Author (policy.author or pricing.author): draft"]:::staff --> EDIT["Switch a rule, change a limit, a setting or a rate band"]:::staff
  EDIT --> IMP["Impact: how recent decisions would have changed"]:::sys
  IMP --> SUBMIT["Sent for approval"]:::staff
  SUBMIT --> APR{"Approver (someone else)"}:::staff
  APR -- reject --> BACK["Back to the author with a reason"]:::out
  APR -- "approve, with a start date" --> WAITD["Approved, waiting"]:::out
  WAITD --> LIVE["Live on its date; the old version is kept as history"]:::sys
```

| Step | Who | Screen | Database function |
|---|---|---|---|
| Draft, edit | Policy author | Policy Rules | `fn_policy_draft_create`, `fn_policy_rule_draft`, `fn_policy_draft_set_param` |
| Impact | System | Approvals | `fn_policy_impact` |
| Approve | Policy approver | Approvals | `fn_policy_submit`, `fn_policy_approve`, `fn_policy_reject` |
| Live | System (daily) | — | `fn_policy_activate_due` |
| Prices | Pricing author, pricing approver | Rate Grid | `fn_rate_grid_draft_create`, `fn_rate_grid_draft_save`, `fn_rate_grid_submit`, `fn_rate_grid_decide`, `fn_rate_grid_activate_due` |
| Employer category | Employer manager, a second person | Employer Master | `fn_employer_request_category`, `fn_employer_decide_category` |
