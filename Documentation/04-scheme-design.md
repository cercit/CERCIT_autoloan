# Scheme design

The car loan scheme cercit runs today, read from the live database on 23 Oct 2026. Product `CAR_NEW_SALARIED`: new cars, salaried applicants. Policy version **2026.08** and rate grid **v1**, both in force since 2026-08-01.

How a case is priced: the bureau score picks the band (Approve, Maybe or Reject). The band sets the base rate and the caps. The employer category (A, B or C) adds a rate loading, its own LTV and tenure caps, and the processing fee. The tighter cap wins.

## Bureau bands (rate grid v1)

| Band | Score from | Score to | Base rate % p.a. | Rate type | Max LTV % | Max FOIR % | Max tenure (months) |
|---|---|---|---|---|---|---|---|
| APPROVE | 750 | 900 | 8.99 | STANDARD | 120 | 50 | 96 |
| MAYBE | 650 | 749 | 9.9 | RISK_ADJUSTED | 100 | 45 | 84 |
| REJECT | 300 | 649 |  | - |  |  |  |

## Employer categories

| Category | Who | Rate loading % p.a. | Max LTV % | Max tenure (months) | Processing fee (Rs) |
|---|---|---|---|---|---|
| A | Listed companies, central/state government, PSUs and large MNCs | +0 | 120 | 84 | 5,000 |
| B | Established private limited companies with 3+ years of filings | +0.4 | 110 | 84 | 6,500 |
| C | Small private, unlisted and proprietorship employers | +1.25 | 90 | 60 | 8,000 |

Example: a 780 score at a Category B employer gets 8.99 + 0.4 = 9.39% p.a., LTV up to 110% (category cap is tighter than the band's 120%), tenure up to 84 months, fee Rs 6,500.

## Policy rules (16, all on)

A failed REJECT rule declines the case. A failed MAYBE rule sends it to an officer.

| Rule | Name | Area | Checks | Condition | Unit | If it fails |
|---|---|---|---|---|---|---|
| HF-AGE-MIN | Minimum age | hard filter | `age_at_application` | >= 21 | years | REJECT |
| HF-AGE-MAX | Maximum age at maturity | hard filter | `age_at_maturity` | <= 65 | years | REJECT |
| BUR-SCORE-MIN | Minimum CIBIL score | bureau | `cibil_score` | >= 650 |  | REJECT |
| BUR-DPD-12M | Zero DPD in 12 months | bureau | `dpd_max_12m` | = 0 | days | REJECT |
| BUR-DPD-60 | No 60+ DPD ever | bureau | `dpd_60_plus_flag` | = false |  | REJECT |
| BUR-WRITEOFF | No write-off in 5 years | bureau | `writeoff_count_5y` | = 0 |  | REJECT |
| BUR-SETTLED | No settled accounts in 5 years | bureau | `settled_count_5y` | = 0 |  | REJECT |
| BUR-ENQUIRY | Enquiry velocity check | bureau | `enquiry_count_90d` | <= 3 |  | MAYBE |
| BUR-ACTIVE | Active accounts limit | bureau | `active_accounts` | <= 3 |  | MAYBE |
| INC-FOIR | FOIR maximum | income | `foir_pct` | <= 50 | % | MAYBE |
| INC-VARIANCE | Income variance check | income | `income_variance_pct` | <= 5 | % | MAYBE |
| COL-LTV | LTV maximum | collateral | `ltv_pct` | <= 120 | % | REJECT |
| BS-BOUNCE | Zero bounces | bank statement | `bounce_count_6m` | = 0 |  | REJECT |
| BS-AMB | Minimum average monthly balance | bank statement | `min_amb_vs_emi_pct` | >= 20 | % of EMI | MAYBE |
| BS-SALARY-REG | Salary regularity | bank statement | `salary_regularity` | = REGULAR |  | MAYBE |
| KYC-NAME | Name match across documents | eligibility | `name_match_score` | >= 98 | % | MAYBE |

## Policy parameters (version 2026.08)

| Area | Key | Meaning | Unit | Value |
|---|---|---|---|---|
| bureau | `bureau.band_min.approve` | Approve band: lowest bureau score | score | 750 |
| bureau | `bureau.band_min.maybe` | Maybe band: lowest bureau score | score | 650 |
| charges | `charges.processing_fee.cat_a` | Processing fee: Category A | INR | 5000 |
| charges | `charges.processing_fee.cat_b` | Processing fee: Category B | INR | 6500 |
| charges | `charges.processing_fee.cat_c` | Processing fee: Category C | INR | 8000 |
| collateral | `caps.max_ltv_pct.approve` | Max LTV: Approve band | % of ex-showroom | 120 |
| collateral | `caps.max_ltv_pct.maybe` | Max LTV: Maybe band | % of ex-showroom | 100 |
| collateral | `caps.max_ltv_pct.cat_a` | Max LTV: Category A | % of ex-showroom | 120 |
| collateral | `caps.max_ltv_pct.cat_b` | Max LTV: Category B | % of ex-showroom | 110 |
| collateral | `caps.max_ltv_pct.cat_c` | Max LTV: Category C | % of ex-showroom | 90 |
| income | `caps.max_foir_pct.approve` | Max FOIR: Approve band | % of net income | 50 |
| income | `caps.max_foir_pct.maybe` | Max FOIR: Maybe band | % of net income | 45 |
| pricing | `pricing.base_rate.approve` | Base rate: Approve band | % p.a. | 8.99 |
| pricing | `pricing.base_rate.maybe` | Base rate: Maybe band | % p.a. | 9.9 |
| pricing | `pricing.loading.cat_a` | Rate loading: Category A | % p.a. | 0 |
| pricing | `pricing.loading.cat_b` | Rate loading: Category B | % p.a. | 0.4 |
| pricing | `pricing.loading.cat_c` | Rate loading: Category C | % p.a. | 1.25 |
| tenure | `caps.max_tenure_months.approve` | Max tenure: Approve band | months | 96 |
| tenure | `caps.max_tenure_months.maybe` | Max tenure: Maybe band | months | 84 |
| tenure | `caps.max_tenure_months.cat_a` | Max tenure: Category A | months | 84 |
| tenure | `caps.max_tenure_months.cat_b` | Max tenure: Category B | months | 84 |
| tenure | `caps.max_tenure_months.cat_c` | Max tenure: Category C | months | 60 |

## August template compared with live

The first scheme design (`docs/scheme_design_template.xlsx`, Aug 2026) next to what the engine does now. "Not an engine rule yet" means the value was agreed but no rule checks it.

| Area | Parameter | Aug 2026 template | Live now |
|---|---|---|---|
| Loan structure | Min loan amount | Rs 1,00,000 | Not an engine rule yet |
| Loan structure | Max loan amount | Rs 18,00,000 | Not an engine rule yet |
| Loan structure | Min tenure | 12 months | Not an engine rule yet |
| Loan structure | Max tenure | 96 months | 96 (Approve band), 84 (Maybe band); capped by category: A 84, B 84, C 60 |
| Loan structure | LTV base | Ex-showroom price | Ex-showroom price (same) |
| Loan structure | Max LTV | 120% | 120% (rule COL-LTV, Approve band); Maybe band 100%; category caps A 120, B 110, C 90 |
| Loan structure | Min down payment | 0% | 0% when 120% LTV applies |
| Income | Min net salary | Rs 25,000 a month | Not an engine rule yet |
| Income | FOIR denominator | Net salary, no bonus | Net income (same) |
| Income | Max FOIR | 50% | 50% (rule INC-FOIR, Approve band); Maybe band 45% |
| Income | Max DBR | 45% | Not an engine rule yet |
| Income | Variable income counted | 20% of 6-month average | Not an engine rule yet |
| Income | EMIs ending in 2-3 months | Exclude from FOIR | Recorded as bureau_summary.emi_ending_3m |
| Bureau | CIBIL 750+ | Approve at 8.99% | Approve band 750-900 at 8.99% (same) |
| Bureau | CIBIL 650-749 | Maybe at 9.9% | Maybe band 650-749 at 9.9% (same) |
| Bureau | CIBIL below 650 | Reject | Reject (rule BUR-SCORE-MIN) |
| Bureau | Max DPD, 12 months | 0 | 0 (rule BUR-DPD-12M, reject) |
| Bureau | Max DPD, 24 months | 30 days, 2 times; any 60+ = reject | Any 60+ DPD = reject (BUR-DPD-60); 30-day count recorded but not a rule |
| Bureau | Max enquiries, 90 days | 3 | 3 (rule BUR-ENQUIRY, sends to Maybe) |
| Bureau | Max active loans | 3 | 3 (rule BUR-ACTIVE, sends to Maybe) |
| Bureau | Write-off / settled, 5 years | 0 | 0 (rules BUR-WRITEOFF and BUR-SETTLED, reject) |
| Bank statement | Bounces, 6 months | 0 | 0 (rule BS-BOUNCE, reject) |
| Bank statement | Cash deposits, 6 months | Up to Rs 10 lakh with proof | Recorded (cash_deposit_total_6m); not a rule |
| Bank statement | Min average monthly balance | 20% of EMI, 5 dates a month | 20% of EMI (rule BS-AMB, sends to Maybe) |
| Eligibility | Min age | 21 | 21 (rule HF-AGE-MIN) |
| Eligibility | Max age at maturity | 68 | 65 (rule HF-AGE-MAX): changed since the template |
| Pricing | Standard rate | 8.99% | 8.99% + category loading (A 0, B 0.4, C 1.25) |
| Pricing | Risk-adjusted rate | 9.9% | 9.9% + category loading |
| Pricing | Processing fee | 1-2% of loan | Flat by employer category: A Rs 5,000, B Rs 6,500, C Rs 8,000 |
| Validation | Income variance, declared vs documents | 5% | 5% (rule INC-VARIANCE, sends to Maybe) |
| Validation | Obligation variance, declared vs bureau | 10% | Not an engine rule yet |
| Validation | Min OCR confidence | 95% | Set per document type in document_check_rules |
| Validation | Min name match | 98% | 98% (rule KYC-NAME, sends to Maybe; fed by KYC name scoring since 090) |
| Targets | Straight-through rate | 90% | Design target, not stored |
| Targets | Turnaround, Approve cases | 60 minutes | Design target, not stored |
| Targets | Turnaround, Maybe cases | 48 working hours | Design target, not stored |
| Targets | Sanction letter validity | 30 days | Design target (applications.sanction_valid_until holds the date) |
| Targets | Draft application expiry | 15 days | Design target (applications.draft_expires_at holds the date) |

## Where it lives

| What | Table | Changed by |
|---|---|---|
| Bands and category pricing | `rate_grid_versions`, `rate_grid_version_bands`, `rate_grid_version_categories` | Credit Head proposes a new version; Admin approves |
| Rules | `policy_rules` (history in `policy_rule_history`, `policy_version_rule_changes`) | Credit Head proposes; Admin approves |
| Parameters | `policy_parameters`, defined in `parameter_definitions` | Through a new policy version |
| Versions | `policy_versions`, `policy_version_events` | Draft, submitted, approved, active |
