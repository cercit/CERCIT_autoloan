# Data points check, before the 2,000 synthetic customers

28 Sep 2026. This compares the data model we designed from the document map (`customer-data-model.md`, 27 Sep) with what is built up to migration 050. The synthetic customers can only fill tables that exist, so any gap here is a gap in the demo data too.

**Verdict.** Build batch 1 (customer, application, documents, vehicle) is done, and so is everything after approval (offer, KFS, agreement, mandate, loan). Batches 2 and 3, the detailed bureau data and the detailed income and bank data, are **not built**. Today a customer's bureau report is one summary line, and their income is four numbers. The officer's case view, the policy engine's reconciliation and the ML model all expect more than that.

## What exists and what is missing

✔ built · ◐ partly · ✘ not built

| Area | Designed | Status | What's missing |
|---|---|---|---|
| Reference | document_types | ✔ | none |
| | lender_aliases, bureau_product_map | ✘ | Needed for two bureaus and loan reconciliation (R12) |
| | oem_price_list | ✘ | The ±5% ex-showroom check has nothing to check against |
| Identity | customers (extended) | ◐ | Name as on PAN, PAN date of issue, DOB source |
| | customer_addresses | ◐ | District not captured |
| | customer_consents | ◐ | IP address and device not recorded |
| | kyc_records | ✘ | How identity was proven (DigiLocker / upload / e-KYC) |
| | face_matches | ◐ | Scores are built (kyc_face_matches). Liveness, location and device are missing |
| Application | applications, requirements, documents | ✔ | Perceptual image hash and page count on documents |
| | document_fields | ✘ | Extracted values sit in S3 files only (R20) |
| | document_checks (cross-document) | ✘ | The cross-validator writes to S3 only |
| | document_authenticity_checks | ✘ | Designed as switched off |
| Income | salary_slips (3 a month), slip lines | ✘ | Gross, net, PF, TDS, employer loan recovery, LOP flag, per month |
| | form16_part_b | ✘ | Annual income, employer TAN, house-property loss (hidden home loan), signature check |
| | income_assessments | ✔ | Filled by the credit checks (048) |
| Bank | bank_statement_analyses | ◐ | Summary only. Holder-name match, account open date, IFSC and opening/closing balance are missing |
| | bank_monthly_summary | ✘ | Salary day, EMI debits, bounces and balances on the 5th/10th/15th/20th/25th, by month |
| | bank_transactions (extended) | ✘ | Channel, category, counterparty |
| Bureau | bureau_reports | ◐ | One report, not two. No report id, no-hit flag or validity date |
| | bureau_accounts, payment history, enquiries, profile items, summary | ✘ | Every loan and card, the 24-month late-payment grid, SMA counts, the 5% card obligation |
| Vehicle | vehicle_quotations, vehicles | ✔ | Name-on-quote match %, OEM price variance |
| After approval | offers/KFS, agreements, mandates, loan accounts, instalments, repayments | ✔ | none (built beyond the design) |

## Plan for the 2,000 customers

1. **051 Bureau detail.**
   - Tables: lender aliases, product map, bureau accounts (the 24-month grid stored as one array per account, not a row per month, to keep the database small), enquiries, and a per-bureau plus combined summary with the 5% card obligation.
   - The simulated bureau pull becomes two bureaus, with the worse of the two counting (R12).
2. **052 Income and bank detail.**
   - Tables: salary slips (3 months), Form 16 Part B, bank monthly summary and holder details.
   - The credit checks read from these instead of four loose numbers.
3. **Synthetic generator** (`sql/optional/synthetic_2000.sql`, run in four parts of 500 so the SQL editor doesn't time out). It creates:
   - **2,000 customers.** Marked synthetic, so the demo login can see them and nobody mistakes them for real people.
   - **Applications across every stage:** drafts, submitted, under assessment, referred, rejected, approved in principle, final, offered, signed, disbursed.
   - **Disbursed loans with repayment history.** About 2–3% touch 30 days late and about 0.5% go past 90, for the portfolio view and the ML model.
4. **Where the distributions come from:** your industry notes.
   - **Profile:** age 25+ with a peak at 35–40; government employees need 3+ years of service.
   - **Cars:** mostly Maruti and Hyundai hatchbacks and compacts, with an average loan of about ₹8.5 lakh, moving to ₹8.5–11.5 lakh for SUVs.
   - **Loan terms:** tenure 48–84 months; LTV up to 100% of on-road, with about 20% of buyers putting money down.
   - **Bureau scores** use the post-Feb-2026 recalibration: 750+ is prime, 700–750 is considered, 600–700 is NBFC territory. I'm centring the simulated scores about 20 points lower than the pull built on 28 Sep, to match.
   - **Obligations:** home loans and personal loans inside FOIR, and card holders split between those who pay in full and those who pay only the minimum.

Nothing here uses real people's data. Names, PANs and mobiles are generated and can't collide with real ones: PANs use an unused fourth-letter pattern, and mobiles come from one test series.
