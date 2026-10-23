# Database schema

Every table in the cercit database, as it stands on 23 Oct 2026 (migrations 001 to 095).
Built from all migrations loaded into a local Postgres and checked against the live Supabase project: 102 tables, every column count matches live. All data in it is synthetic.

How to read a table entry: **Key** shows PK (primary key), FK (foreign key) and UK (unique). **Refers to** is the table.column a foreign key points at. **Allowed** lists the values a CHECK constraint accepts. Definitions are in [03-relationships-and-cardinality.md](03-relationships-and-cardinality.md#terms).

## Areas

| Area | Tables |
|---|---|
| Customer and application intake | [customers](#customers), [customer_addresses](#customer_addresses), [customer_consents](#customer_consents), [consent_texts](#consent_texts), [applications](#applications), [application_detail_groups](#application_detail_groups), [application_stage_events](#application_stage_events), [application_document_requirements](#application_document_requirements), [vehicles](#vehicles), [vehicle_quotations](#vehicle_quotations), [dealers](#dealers), [states](#states) |
| Documents and KYC | [documents](#documents), [document_types](#document_types), [document_extractions](#document_extractions), [document_readings](#document_readings), [document_check_rules](#document_check_rules), [document_check_results](#document_check_results), [document_auto_settings](#document_auto_settings), [document_auto_policy](#document_auto_policy), [kyc_face_matches](#kyc_face_matches), [document_storage_deletions](#document_storage_deletions) |
| Credit bureau | [bureau_reports](#bureau_reports), [bureau_summary](#bureau_summary), [bureau_accounts](#bureau_accounts), [bureau_enquiries](#bureau_enquiries), [bureau_lenders](#bureau_lenders), [lender_aliases](#lender_aliases), [bureau_product_map](#bureau_product_map) |
| Income and banking | [income_assessments](#income_assessments), [salary_slips](#salary_slips), [form16_part_b](#form16_part_b), [bank_statement_analyses](#bank_statement_analyses), [bank_monthly_summary](#bank_monthly_summary), [bank_transactions](#bank_transactions), [obligation_details](#obligation_details) |
| Employers | [employers](#employers), [employer_checks](#employer_checks), [employer_category_changes](#employer_category_changes), [employer_reference_list](#employer_reference_list), [employer_master_settings](#employer_master_settings), [employer_category_pricing](#employer_category_pricing) |
| Policy rules and decisions | [policy_rules](#policy_rules), [policy_results](#policy_results), [policy_versions](#policy_versions), [policy_documents](#policy_documents), [policy_parameters](#policy_parameters), [parameter_definitions](#parameter_definitions), [policy_change_requests](#policy_change_requests), [policy_change_reviews](#policy_change_reviews), [policy_simulations](#policy_simulations), [policy_version_events](#policy_version_events), [policy_version_rule_changes](#policy_version_rule_changes), [policy_rule_history](#policy_rule_history), [rule_set_snapshots](#rule_set_snapshots), [reason_codes](#reason_codes), [recommendations](#recommendations), [engine_decisions](#engine_decisions), [credit_decisions](#credit_decisions), [override_logs](#override_logs), [fraud_signals](#fraud_signals) |
| Pricing and rate grid | [rate_grid](#rate_grid), [rate_grid_versions](#rate_grid_versions), [rate_grid_version_bands](#rate_grid_version_bands), [rate_grid_version_categories](#rate_grid_version_categories), [pricing_products](#pricing_products) |
| Loan after approval | [loan_offers](#loan_offers), [loan_agreements](#loan_agreements), [repayment_mandates](#repayment_mandates), [loan_accounts](#loan_accounts), [loan_installments](#loan_installments), [loan_repayments](#loan_repayments), [loan_status_snapshot](#loan_status_snapshot), [loan_status_stale](#loan_status_stale) |
| Risk models | [model_versions](#model_versions), [model_scores](#model_scores), [model_controls](#model_controls) |
| Staff, roles and access | [users](#users), [roles](#roles), [permissions](#permissions), [role_permissions](#role_permissions), [permission_conflicts](#permission_conflicts), [role_conflict_waivers](#role_conflict_waivers), [role_change_requests](#role_change_requests), [security_settings](#security_settings), [team_reset_accounts](#team_reset_accounts), [team_change_journal](#team_change_journal), [practice_case_snapshots](#practice_case_snapshots) |
| Audit and data protection | [audit_events](#audit_events), [audit_chain](#audit_chain), [app_secrets](#app_secrets), [data_protection_settings](#data_protection_settings), [erasure_requests](#erasure_requests) |
| Platform settings | [tenants](#tenants), [feature_flags](#feature_flags), [feature_flag_history](#feature_flag_history), [organisation_settings](#organisation_settings), [simulation_settings](#simulation_settings), [sim_daily_runs](#sim_daily_runs), [settings_baselines](#settings_baselines), [settings_backups](#settings_backups), [app_feedback](#app_feedback) |

Every table has row level security switched on. Staff read through `fn_is_active_staff()`; real customers' rows need the PII right (`fn_sees_real_customers()`); most writes go through SECURITY DEFINER functions, not direct table access.

## Customer and application intake

### customers

Created in `001_schema.sql`; 40 columns; primary key (id); about 2,131 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal primary key |
| 2 | `full_name` | varchar | no |  |  |  |  | Full name as per PAN card |
| 3 | `email` | varchar | no |  | UK |  |  | Primary identity; OTP verified |
| 4 | `mobile` | varchar | yes |  |  |  |  | Contact number (not verified in Phase 1) |
| 5 | `pan_number` | varchar | yes |  |  |  |  | PAN extracted from uploaded PAN card |
| 6 | `aadhaar_last_four` | varchar | yes |  |  |  |  | Last 4 digits of Aadhaar (full number never stored) |
| 7 | `date_of_birth` | date | yes |  |  |  |  | DOB from KYC documents |
| 8 | `age_at_application` | int2 | yes |  |  |  |  | Age calculated at application date (min 21) |
| 9 | `gender` | varchar | yes |  |  |  |  | M / F / OTHER — from KYC |
| 10 | `address_line1` | varchar | yes |  |  |  |  | Current address from Aadhaar |
| 11 | `address_line2` | varchar | yes |  |  |  |  | Address line 2 |
| 12 | `city` | varchar | yes |  |  |  |  | City name |
| 13 | `state_code` | varchar | yes |  | FK | states.code |  | State code |
| 14 | `pincode` | varchar | yes |  |  |  |  | 6-digit pincode |
| 15 | `employer_name` | varchar | yes |  |  |  |  | Employer as per salary slip / Form 16 |
| 16 | `employment_type` | varchar | yes |  |  |  |  | SALARIED (Phase 1 only) |
| 17 | `email_verified` | bool | no | false |  |  |  | True after OTP verification |
| 18 | `auth_user_id` | uuid | yes |  |  |  |  | Supabase Auth user ID for login/OTP |
| 19 | `created_at` | timestamptz | no | now() |  |  |  | Record creation timestamp |
| 20 | `updated_at` | timestamptz | no | now() |  |  |  | Last update timestamp |
| 21 | `pan_enc` | bytea | yes |  |  |  |  | Pan enc |
| 22 | `pan_hash` | text | yes |  |  |  |  | Pan hash |
| 23 | `pan_last4` | varchar | yes |  |  |  |  | Pan last4 |
| 24 | `mobile_enc` | bytea | yes |  |  |  |  | Mobile enc |
| 25 | `mobile_last4` | varchar | yes |  |  |  |  | Mobile last4 |
| 26 | `designation` | varchar | yes |  |  |  |  | Designation |
| 27 | `years_in_current_job` | int2 | yes |  |  |  |  | Years in current job |
| 28 | `total_work_experience_years` | int2 | yes |  |  |  |  | Total work experience years |
| 29 | `salary_bank_name` | varchar | yes |  |  |  |  | Salary bank name |
| 30 | `residence_type` | varchar | yes |  |  |  |  | Residence type |
| 31 | `first_name` | varchar | yes |  |  |  |  | First name |
| 32 | `middle_name` | varchar | yes |  |  |  |  | Middle name |
| 33 | `last_name` | varchar | yes |  |  |  |  | Last name |
| 34 | `mobile_verified_at` | timestamptz | yes |  |  |  |  | When mobile verified |
| 35 | `mobile_verification_method` | varchar | yes |  |  |  |  | Mobile verification method |
| 36 | `father_name` | varchar | yes |  |  |  |  | Father name |
| 37 | `marital_status` | varchar | yes |  |  |  |  | Marital status |
| 38 | `date_of_joining` | date | yes |  |  |  |  | Date of joining |
| 39 | `employer_category` | varchar | yes |  |  |  |  | Employer category |
| 40 | `mobile_hash` | text | yes |  |  |  |  | Mobile hash |

Relationships:
- belongs to `states` via `state_code` (one-to-many, 0..1 : 0..N; optional)
- has `applications` rows via `applications.customer_id` (one-to-many, 1 : 0..N)
- has `bank_statement_analyses` rows via `bank_statement_analyses.customer_id` (one-to-many, 1 : 0..N)
- has `bureau_reports` rows via `bureau_reports.customer_id` (one-to-many, 1 : 0..N)
- has `customer_addresses` rows via `customer_addresses.customer_id` (one-to-many, 1 : 0..N)
- has `customer_consents` rows via `customer_consents.customer_id` (one-to-many, 1 : 0..N)
- has `erasure_requests` rows via `erasure_requests.customer_id` (one-to-many, 1 : 0..N)
- has `loan_accounts` rows via `loan_accounts.customer_id` (one-to-many, 1 : 0..N)

Triggers: `trg_customers_encrypt_pii`, `trg_customers_updated_at`.

### customer_addresses

Created in `043_customer_onboarding.sql`; 17 columns; primary key (id); about 2 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `customer_id` | uuid | no |  | FK | customers.id |  | Link to customers.id |
| 3 | `address_type` | varchar | no |  |  |  | PERMANENT \| CURRENT \| OFFICE | Address type |
| 4 | `line1` | varchar | no |  |  |  |  | Line1 |
| 5 | `line2` | varchar | yes |  |  |  |  | Line2 |
| 6 | `city` | varchar | no |  |  |  |  | City |
| 7 | `district` | varchar | yes |  |  |  |  | District |
| 8 | `state_code` | varchar | yes |  | FK | states.code |  | Link to states.code |
| 9 | `pincode` | varchar | no |  |  |  |  | Pincode |
| 10 | `source` | varchar | no | 'TYPED' |  |  |  | Source |
| 11 | `is_rented` | bool | yes |  |  |  |  | Yes/no: rented |
| 12 | `owner_name` | varchar | yes |  |  |  |  | Owner name |
| 13 | `owner_contact` | varchar | yes |  |  |  |  | Owner contact |
| 14 | `verified` | bool | no | false |  |  |  | Verified |
| 15 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 16 | `years_at_address` | int2 | yes |  |  |  |  | Years at address |
| 17 | `residence_type` | varchar | yes |  |  |  |  | Residence type |

Unique together: (customer_id, address_type).

Relationships:
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)
- belongs to `states` via `state_code` (one-to-many, 0..1 : 0..N; optional)

### customer_consents

Created in `043_customer_onboarding.sql`; 9 columns; primary key (id); about 1,892 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `customer_id` | uuid | no |  | FK | customers.id |  | Link to customers.id |
| 3 | `application_id` | uuid | yes |  | FK | applications.id |  | Link to applications.id |
| 4 | `purpose` | varchar | no |  | FK | consent_texts.purpose |  | Link to consent_texts.purpose |
| 5 | `version` | varchar | no |  | FK | consent_texts.version |  | Link to consent_texts.version |
| 6 | `body_sha256` | varchar | no |  |  |  |  | Body sha256 |
| 7 | `user_agent` | text | yes |  |  |  |  | User agent |
| 8 | `given_at` | timestamptz | no | now() |  |  |  | When given |
| 9 | `withdrawn_at` | timestamptz | yes |  |  |  |  | When withdrawn |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)
- belongs to `consent_texts` via `purpose, version` (one-to-many, 1 : 0..N; required)
- has `bureau_reports` rows via `bureau_reports.consent_id` (one-to-many, 0..1 : 0..N)
- has `bureau_summary` rows via `bureau_summary.consent_id` (one-to-many, 0..1 : 0..N)

### consent_texts

Created in `043_customer_onboarding.sql`; 5 columns; primary key (purpose, version).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `purpose` | varchar | no |  | PK |  |  | Purpose |
| 2 | `version` | varchar | no |  | PK |  |  | Version |
| 3 | `body` | text | no |  |  |  |  | Body |
| 4 | `is_current` | bool | no | true |  |  |  | Yes/no: current |
| 5 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- has `customer_consents` rows via `customer_consents.purpose, version` (one-to-many, 1 : 0..N)

### applications

Created in `001_schema.sql`; 46 columns; primary key (id); about 2,192 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal primary key |
| 2 | `application_id` | varchar | no |  | UK |  |  | Public ID: YYYYMM + 6-digit serial (202608000001) |
| 3 | `customer_id` | uuid | no |  | FK | customers.id |  | Link to customer record |
| 4 | `vehicle_id` | uuid | yes |  | FK | vehicles.id |  | Link to vehicle record; set at Step 2 |
| 5 | `status` | varchar | no | 'DRAFT' |  |  |  | DRAFT \| IN_PRINCIPLE_APPROVED \| DOCUMENTS_SUBMITTED \| UNDER_ASSESSMENT \| APPROVED \| REJECTED \| UNDER_REVIEW |
| 6 | `current_step` | int2 | no | 1 |  |  |  | Last completed step (1-7) |
| 7 | `loan_amount_requested` | numeric | yes |  |  |  |  | On-road price minus down payment (Step 2) |
| 8 | `down_payment` | numeric | yes |  |  |  |  | Customer's own contribution |
| 9 | `tenure_months` | int2 | yes |  |  |  |  | Requested tenure in months (12-96) |
| 10 | `purpose` | varchar | yes |  |  |  |  | NEW \| EXCHANGE \| ADDITIONAL |
| 11 | `exchange_vehicle_detail` | text | yes |  |  |  |  | Make/model/year of current vehicle if exchange |
| 12 | `exchange_existing_loan` | bool | yes |  |  |  |  | Does current vehicle have an outstanding loan? |
| 13 | `exchange_outstanding_amount` | numeric | yes |  |  |  |  | Outstanding loan on exchange vehicle |
| 14 | `exchange_monthly_emi` | numeric | yes |  |  |  |  | Monthly EMI on exchange vehicle; feeds obligation |
| 15 | `declared_net_salary` | numeric | yes |  |  |  |  | Self-declared monthly net salary (Step 3) |
| 16 | `declared_other_income` | numeric | yes |  |  |  |  | Self-declared other monthly income |
| 17 | `other_income_source` | varchar | yes |  |  |  |  | Brief description of other income |
| 18 | `declared_existing_emis` | numeric | yes |  |  |  |  | Self-declared total existing EMIs |
| 19 | `declared_rent` | numeric | yes |  |  |  |  | Monthly rent/housing (0 if owned) |
| 20 | `declared_insurance` | numeric | yes |  |  |  |  | Monthly insurance premiums |
| 21 | `declared_food_household` | numeric | yes |  |  |  |  | Monthly food/household expenses |
| 22 | `declared_travel` | numeric | yes |  |  |  |  | Monthly travel/commute |
| 23 | `declared_other_expenses` | numeric | yes |  |  |  |  | Other regular monthly expenses |
| 24 | `indicative_emi` | numeric | yes |  |  |  |  | System-calculated indicative EMI at Step 4 |
| 25 | `indicative_rate` | numeric | yes |  |  |  |  | Rate shown at in-principle stage |
| 26 | `in_principle_result` | varchar | yes |  |  |  |  | ELIGIBLE \| NOT_ELIGIBLE (Step 4 quick check) |
| 27 | `in_principle_at` | timestamptz | yes |  |  |  |  | When in-principle decision was made |
| 28 | `documents_submitted_at` | timestamptz | yes |  |  |  |  | When all 9 docs uploaded |
| 29 | `assessment_started_at` | timestamptz | yes |  |  |  |  | When Step 7 assessment began |
| 30 | `final_decision_at` | timestamptz | yes |  |  |  |  | When final decision was recorded |
| 31 | `draft_expires_at` | timestamptz | yes |  |  |  |  | Draft auto-expires 15 days after creation |
| 32 | `sanction_valid_until` | timestamptz | yes |  |  |  |  | Sanction letter valid for 30 calendar days |
| 33 | `assigned_officer_id` | uuid | yes |  | FK | users.id |  | Credit officer assigned for Maybe cases |
| 34 | `state_code` | varchar | yes |  | FK | states.code |  | State where vehicle will be registered |
| 35 | `created_at` | timestamptz | no | now() |  |  |  | Record creation timestamp |
| 36 | `updated_at` | timestamptz | no | now() |  |  |  | Last update timestamp |
| 37 | `channel` | varchar | no | 'DIRECT' |  |  |  | Channel |
| 38 | `onboarding_step` | int2 | no | 1 |  |  |  | Onboarding step |
| 39 | `approval_stage` | varchar | yes |  |  |  |  | Approval stage |
| 40 | `quote_pending` | bool | no | false |  |  |  | Quote pending |
| 41 | `customer_submitted_at` | timestamptz | yes |  |  |  |  | When customer submitted |
| 42 | `origin` | varchar | no | 'STAFF' |  |  |  | Origin |
| 43 | `auto_review` | jsonb | yes |  |  |  |  | Auto review |
| 44 | `employer_id` | uuid | yes |  | FK | employers.id |  | Link to employers.id |
| 45 | `employer_category` | bpchar | yes |  |  |  |  | Employer category |
| 46 | `employer_category_basis` | varchar | yes |  |  |  |  | Employer category basis |

Relationships:
- belongs to `users` via `assigned_officer_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)
- belongs to `employers` via `employer_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `states` via `state_code` (one-to-many, 0..1 : 0..N; optional)
- belongs to `vehicles` via `vehicle_id` (one-to-many, 0..1 : 0..N; optional)
- has `application_detail_groups` rows via `application_detail_groups.application_id` (one-to-many, 1 : 0..N)
- has `application_document_requirements` rows via `application_document_requirements.application_id` (one-to-many, 1 : 0..N)
- has `application_stage_events` rows via `application_stage_events.application_id` (one-to-many, 1 : 0..N)
- has `audit_events` rows via `audit_events.application_id` (one-to-many, 0..1 : 0..N)
- has `bank_monthly_summary` rows via `bank_monthly_summary.application_id` (one-to-many, 1 : 0..N)
- has `bank_statement_analyses` rows via `bank_statement_analyses.application_id` (one-to-many, 1 : 0..N)
- has `bank_transactions` rows via `bank_transactions.application_id` (one-to-many, 1 : 0..N)
- has `bureau_reports` rows via `bureau_reports.application_id` (one-to-many, 1 : 0..N)
- has `bureau_summary` rows via `bureau_summary.application_id` (one-to-many, 1 : 0..N)
- has `credit_decisions` rows via `credit_decisions.application_id` (one-to-many, 1 : 0..N)
- has `customer_consents` rows via `customer_consents.application_id` (one-to-many, 0..1 : 0..N)
- has `document_check_results` rows via `document_check_results.application_id` (one-to-many, 1 : 0..N)
- has `document_extractions` rows via `document_extractions.application_id` (one-to-many, 1 : 0..N)
- has `document_readings` rows via `document_readings.application_id` (one-to-many, 1 : 0..N)
- has `documents` rows via `documents.application_id` (one-to-many, 1 : 0..N)
- has `engine_decisions` rows via `engine_decisions.application_id` (one-to-many, 1 : 0..N)
- has `form16_part_b` rows via `form16_part_b.application_id` (one-to-one, 1 : 0..1)
- has `fraud_signals` rows via `fraud_signals.application_id` (one-to-many, 1 : 0..N)
- has `income_assessments` rows via `income_assessments.application_id` (one-to-many, 1 : 0..N)
- has `kyc_face_matches` rows via `kyc_face_matches.application_id` (one-to-many, 1 : 0..N)
- has `loan_accounts` rows via `loan_accounts.application_id` (one-to-many, 0..1 : 0..N)
- has `loan_agreements` rows via `loan_agreements.application_id` (one-to-many, 1 : 0..N)
- has `loan_offers` rows via `loan_offers.application_id` (one-to-many, 1 : 0..N)
- has `model_scores` rows via `model_scores.application_id` (one-to-many, 1 : 0..N)
- has `obligation_details` rows via `obligation_details.application_id` (one-to-many, 1 : 0..N)
- has `override_logs` rows via `override_logs.application_id` (one-to-many, 1 : 0..N)
- has `policy_results` rows via `policy_results.application_id` (one-to-many, 1 : 0..N)
- has `practice_case_snapshots` rows via `practice_case_snapshots.application_id` (one-to-one, 1 : 0..1)
- has `recommendations` rows via `recommendations.application_id` (one-to-many, 1 : 0..N)
- has `repayment_mandates` rows via `repayment_mandates.application_id` (one-to-many, 1 : 0..N)
- has `salary_slips` rows via `salary_slips.application_id` (one-to-many, 1 : 0..N)
- has `vehicle_quotations` rows via `vehicle_quotations.application_id` (one-to-one, 1 : 0..1)
- has `vehicles` rows via `vehicles.application_id` (one-to-many, 1 : 0..N)

Triggers: `trg_applications_updated_at`, `trg_customer_approve_needs_checks`, `trg_practice_synthetic_only`.

### application_detail_groups

Created in `046_customer_details_submit.sql`; 6 columns; primary key (application_id, group_code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | Link to applications.id |
| 2 | `group_code` | varchar | no |  | PK |  | PERSONAL \| ADDRESS \| EMPLOYMENT | Group code |
| 3 | `prefilled` | jsonb | no | '{}' |  |  |  | Prefilled |
| 4 | `confirmed` | jsonb | no |  |  |  |  | Confirmed |
| 5 | `edited_fields` | text[] | no | '{}' |  |  |  | Edited fields |
| 6 | `confirmed_at` | timestamptz | no | now() |  |  |  | When confirmed |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_detail_groups_emis`.

### application_stage_events

Created in `046_customer_details_submit.sql`; 5 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | Link to applications.id |
| 3 | `stage` | varchar | no |  |  |  |  | Stage |
| 4 | `note` | text | yes |  |  |  |  | Note |
| 5 | `at` | timestamptz | no | now() |  |  |  | At |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_stage_received_auto_review`.

### application_document_requirements

Created in `043_customer_onboarding.sql`; 6 columns; primary key (application_id, doc_type); about 26 rows on 23 Oct 2026; link table between applications and document_types.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | Link to applications.id |
| 2 | `doc_type` | varchar | no |  | PK, FK | document_types.code |  | Link to document_types.code |
| 3 | `required` | varchar | no |  |  |  |  | Required |
| 4 | `status` | varchar | no | 'MISSING' |  |  | MISSING \| RECEIVED \| ACCEPTED \| REUPLOAD \| WAIVED \| NOT_NEEDED | Status |
| 5 | `reason` | text | yes |  |  |  |  | Reason |
| 6 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `document_types` via `doc_type` (one-to-many, 1 : 0..N; required)

Triggers: `trg_practice_synthetic_only`, `trg_requirement_received_auto_review`, `trg_requirements_mark_customer`.

### vehicles

Created in `001_schema.sql`; 18 columns; primary key (id); about 2,008 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal primary key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | Link to application |
| 3 | `make` | varchar | no |  |  |  |  | Vehicle manufacturer/brand |
| 4 | `model` | varchar | no |  |  |  |  | Vehicle model name |
| 5 | `variant` | varchar | no |  |  |  |  | Variant/trim level |
| 6 | `fuel_type` | varchar | no |  |  |  |  | PETROL \| DIESEL \| CNG \| HYBRID \| ELECTRIC |
| 7 | `vehicle_category` | varchar | no |  |  |  |  | CAR \| SCV \| LCV \| 3W (Phase 1: CAR only) |
| 8 | `ex_showroom_price` | numeric | no |  |  |  |  | Ex-showroom price (LTV base) |
| 9 | `road_tax` | numeric | no |  |  |  |  | Road tax amount |
| 10 | `insurance` | numeric | no |  |  |  |  | First-year insurance premium |
| 11 | `registration_charges` | numeric | no |  |  |  |  | Registration + other charges |
| 12 | `on_road_price` | numeric | no |  |  |  |  | Calculated: ex_showroom + tax + insurance + reg |
| 13 | `dealer_id` | uuid | yes |  | FK | dealers.id |  | Dealer (Phase 2; null in Phase 1 direct) |
| 14 | `quotation_number` | varchar | yes |  |  |  |  | Dealer proforma invoice number |
| 15 | `quotation_date` | date | yes |  |  |  |  | Date on dealer quotation |
| 16 | `quotation_verified` | bool | no | false |  |  |  | True if quotation matches Step 2 data |
| 17 | `created_at` | timestamptz | no | now() |  |  |  | Record creation timestamp |
| 18 | `updated_at` | timestamptz | no | now() |  |  |  | Last update timestamp |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `dealers` via `dealer_id` (one-to-many, 0..1 : 0..N; optional)
- has `applications` rows via `applications.vehicle_id` (one-to-many, 0..1 : 0..N)

Triggers: `trg_vehicles_updated_at`.

### vehicle_quotations

Created in `043_customer_onboarding.sql`; 25 columns; primary key (id); about 3 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK, UK | applications.id |  | Link to applications.id |
| 3 | `source` | varchar | no |  |  |  | QUOTATION \| MANUAL | Source |
| 4 | `document_id` | uuid | yes |  | FK | documents.id |  | Link to documents.id |
| 5 | `customer_name_on_quote` | varchar | yes |  |  |  |  | Customer name on quote |
| 6 | `name_match_pct` | int2 | yes |  |  |  |  | Name match pct |
| 7 | `dealer_id` | uuid | yes |  | FK | dealers.id |  | Link to dealers.id |
| 8 | `dealer_name` | varchar | yes |  |  |  |  | Dealer name |
| 9 | `sales_officer_name` | varchar | yes |  |  |  |  | Sales officer name |
| 10 | `sales_officer_mobile` | varchar | yes |  |  |  |  | Sales officer mobile |
| 11 | `quote_date` | date | yes |  |  |  |  | Quote date |
| 12 | `valid_until` | date | yes |  |  |  |  | Valid until |
| 13 | `make` | varchar | no |  |  |  |  | Make |
| 14 | `model` | varchar | no |  |  |  |  | Model |
| 15 | `variant` | varchar | yes |  |  |  |  | Variant |
| 16 | `colour` | varchar | yes |  |  |  |  | Colour |
| 17 | `fuel_type` | varchar | yes |  |  |  |  | Fuel type |
| 18 | `ex_showroom` | numeric | no |  |  |  |  | Ex showroom |
| 19 | `road_tax` | numeric | yes |  |  |  |  | Road tax |
| 20 | `insurance` | numeric | yes |  |  |  |  | Insurance |
| 21 | `on_road` | numeric | yes |  |  |  |  | On road |
| 22 | `loan_amount_requested` | numeric | no |  |  |  |  | Loan amount requested |
| 23 | `tenure_months` | int2 | no |  |  |  |  | Tenure months |
| 24 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 25 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |

Relationships:
- belongs to `applications` via `application_id` (one-to-one, 1 : 0..1; required)
- belongs to `dealers` via `dealer_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `documents` via `document_id` (one-to-many, 0..1 : 0..N; optional)

### dealers

Created in `001_schema.sql`; 10 columns; primary key (id); about 132 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal primary key |
| 2 | `dealer_code` | varchar | no |  | UK |  |  | Unique dealer identifier |
| 3 | `dealer_name` | varchar | no |  |  |  |  | Dealer firm name |
| 4 | `make` | varchar | no |  |  |  |  | OEM/brand the dealer represents |
| 5 | `city` | varchar | yes |  |  |  |  | Dealer city |
| 6 | `state_code` | varchar | yes |  | FK | states.code |  | State code |
| 7 | `risk_tier` | varchar | yes |  |  |  |  | LOW \| MEDIUM \| HIGH (Phase 2 dealer scoring) |
| 8 | `is_active` | bool | no | true |  |  |  | Active dealer flag |
| 9 | `created_at` | timestamptz | no | now() |  |  |  | Record creation timestamp |
| 10 | `updated_at` | timestamptz | no | now() |  |  |  | Last update timestamp |

Relationships:
- belongs to `states` via `state_code` (one-to-many, 0..1 : 0..N; optional)
- has `vehicle_quotations` rows via `vehicle_quotations.dealer_id` (one-to-many, 0..1 : 0..N)
- has `vehicles` rows via `vehicles.dealer_id` (one-to-many, 0..1 : 0..N)

Triggers: `trg_dealers_updated_at`.

### states

Created in `001_schema.sql`; 5 columns; primary key (code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `code` | varchar | no |  | PK |  |  | State abbreviation code |
| 2 | `name` | varchar | no |  | UK |  |  | Full state name |
| 3 | `is_operating` | bool | no | true |  |  |  | Whether lending operations active in this state |
| 4 | `road_tax_pct` | numeric | yes |  |  |  |  | Default road tax % for the state (reference) |
| 5 | `created_at` | timestamptz | no | now() |  |  |  | Record creation timestamp |

Relationships:
- has `applications` rows via `applications.state_code` (one-to-many, 0..1 : 0..N)
- has `customer_addresses` rows via `customer_addresses.state_code` (one-to-many, 0..1 : 0..N)
- has `customers` rows via `customers.state_code` (one-to-many, 0..1 : 0..N)
- has `dealers` rows via `dealers.state_code` (one-to-many, 0..1 : 0..N)
- has `users` rows via `users.state_code` (one-to-many, 0..1 : 0..N)

## Documents and KYC

### documents

One row per file a customer (or staff on their behalf) uploads for an application. A new upload replaces the older live file for the same side unless the type allows several files; replaced rows stay, marked superseded.

Created in `001_schema.sql`; 23 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application this file belongs to. |
| 3 | `doc_type` | varchar | no |  |  |  |  | Document type code from document_types, e.g. PAN, AADHAAR, SALARY_SLIP, BANK_STMT. |
| 4 | `file_name` | varchar | no |  |  |  |  | Original file name as uploaded, cut to 255 characters; 'document' if blank. |
| 5 | `file_path` | text | no |  |  |  |  | Where the file is stored; the upload functions set it to the same value as storage_key. |
| 6 | `file_hash` | varchar | no |  |  |  |  | SHA-256 fingerprint of the file (64 hex characters); the upload is refused if it is not in that form. |
| 7 | `file_size_bytes` | int4 | no |  |  |  |  | File size in bytes; must be under the type's max_mb limit. |
| 8 | `mime_type` | varchar | no |  |  |  |  | File format, e.g. application/pdf, image/jpeg; must be one the document type allows. |
| 9 | `upload_status` | varchar | no | 'UPLOADED' |  |  |  | Upload state; set to UPLOADED when the file is registered. |
| 10 | `ocr_confidence` | numeric | yes |  |  |  |  | How sure the text reader was about this file, as a score with two decimals. |
| 11 | `extraction_status` | varchar | yes |  |  |  |  | State of field extraction for this file. |
| 12 | `uploaded_at` | timestamptz | no | now() |  |  |  | When the file was uploaded. |
| 13 | `extracted_at` | timestamptz | yes |  |  |  |  | When fields were extracted from the file. |
| 14 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 15 | `storage_backend` | varchar | no | 's3' |  |  |  | Where the file is kept: s3 \| supabase \| local. Default s3. |
| 16 | `storage_key` | text | yes |  |  |  |  | The file's key in storage. Queued for deletion when the customer's data is erased. |
| 17 | `side` | varchar | no | 'single' |  |  |  | Which side of a card this file is: front \| back \| single. Default single. |
| 18 | `source` | varchar | no | 'upload' |  |  |  | How the file arrived: upload, or camera for the live photo. |
| 19 | `uploaded_by` | varchar | no | 'customer' |  |  |  | Who uploaded it; customer by default. |
| 20 | `superseded_at` | timestamptz | yes |  |  |  |  | When a newer file replaced this one. Empty means this is the live file. |
| 21 | `was_password_protected` | bool | no | false |  |  |  | True if the file came with a password lock. |
| 22 | `aadhaar_masked` | bool | no | false |  |  |  | True if the Aadhaar number was masked before storing; only the last 4 digits are ever kept. |
| 23 | `unlocked` | bool | no | false |  |  |  | True if a password-protected file was unlocked before storing. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- has `document_extractions` rows via `document_extractions.document_id` (one-to-many, 1 : 0..N)
- has `vehicle_quotations` rows via `vehicle_quotations.document_id` (one-to-many, 0..1 : 0..N)

Triggers: `trg_practice_synthetic_only`.

### document_types

Catalogue of document kinds the lender asks for, one row per type code. Reference data seeded by migrations; it drives the upload screens and each application's document checklist.

Created in `043_customer_onboarding.sql`; 16 columns; primary key (code); about 14 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `code` | varchar | no |  | PK |  |  | Type code, e.g. PAN, AADHAAR, SALARY_SLIP, FORM16_B, BANK_STMT, QUOTE, LIVE_PHOTO, RC. |
| 2 | `name` | varchar | no |  |  |  |  | Name shown to the customer, e.g. 'PAN card'. |
| 3 | `required` | varchar | no |  |  |  | ALWAYS \| CONDITIONAL \| OPTIONAL | Whether it is needed: ALWAYS \| CONDITIONAL \| OPTIONAL. After-approval papers are OPTIONAL so new checklists skip them. |
| 4 | `required_note` | text | yes |  |  |  |  | Plain note on when or why it is needed, e.g. 'Only if the current address differs from Aadhaar'. |
| 5 | `sides` | int2 | no | 1 |  |  |  | Number of sides to capture: 1 or 2 (cards with a front and back). |
| 6 | `sources` | text[] | no |  |  |  |  | Ways it can be supplied: upload, digilocker, otp_ekyc, account_aggregator, camera. |
| 7 | `allowed_mime` | text[] | no | ARRAY['application/pdf', 'image/jpeg'... |  |  |  | File formats accepted. Default PDF, JPEG, PNG; the live photo takes JPEG only. |
| 8 | `max_mb` | int2 | no | 10 |  |  |  | Largest file allowed, in MB. Default 10; live photo 5. |
| 9 | `retention_years` | int2 | no | 8 |  |  |  | How long files of this type are kept, in years. Default 8. |
| 10 | `sort_order` | int2 | no |  |  |  |  | Order in which the type is listed on screen. |
| 11 | `upload_type` | varchar | yes |  |  |  |  | Name the upload service knows the type by. Types without one are not offered for upload. |
| 12 | `storage_folder` | varchar | yes |  |  |  |  | Folder where files land. KYC, salary slip, Form 16 and bank folders trigger the document readers. |
| 13 | `back_required` | bool | no | true |  |  |  | For two-sided types, whether the back must be uploaded too. False for PAN and company ID. |
| 14 | `multi_file` | bool | no | false |  |  |  | True if several files are kept (salary slips, bank statements, ITR); otherwise a new file replaces the old. |
| 15 | `ask_password` | bool | no | false |  |  |  | True if the upload screen asks for a file password (salary slip, bank statement, Aadhaar, ITR, insurance). |
| 16 | `stage` | varchar | no | 'APPLICATION' |  |  |  | When it is collected: APPLICATION \| BEFORE_DISBURSAL \| AFTER_DISBURSAL. Default APPLICATION. |

Relationships:
- has `application_document_requirements` rows via `application_document_requirements.doc_type` (one-to-many, 1 : 0..N)
- has `document_auto_policy` rows via `document_auto_policy.doc_type` (one-to-one, 1 : 0..1)
- has `document_check_rules` rows via `document_check_rules.doc_type` (one-to-many, 1 : 0..N)

### document_extractions

One row per field read out of an uploaded document, from the original schema. It holds the value found, how sure the reader was, and whether a person or the customer confirmed or changed it.

Created in `001_schema.sql`; 17 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `document_id` | uuid | no |  | FK | documents.id |  | The uploaded file the field was read from. |
| 3 | `application_id` | uuid | no |  | FK | applications.id |  | The application the document belongs to. |
| 4 | `field_name` | varchar | no |  |  |  |  | Name of the field read, e.g. a name, date or amount on the document. |
| 5 | `field_value` | text | no |  |  |  |  | The value read for the field, stored as text. |
| 6 | `field_type` | varchar | no |  |  |  |  | Kind of value, such as text, date or number. |
| 7 | `page_number` | int2 | yes |  |  |  |  | Page of the document the value was found on. |
| 8 | `extraction_method` | varchar | no |  |  |  |  | How the value was read, e.g. which reader or method. |
| 9 | `confidence` | numeric | no |  |  |  |  | How sure the reader was, as a fraction with four decimals (0 to 1). |
| 10 | `source_type` | varchar | no |  |  |  |  | The kind of source the value came from. |
| 11 | `verified` | bool | no | false |  |  |  | True once the value has been confirmed. |
| 12 | `verified_by` | varchar | yes |  |  |  |  | Who confirmed the value. |
| 13 | `verified_at` | timestamptz | yes |  |  |  |  | When the value was confirmed. |
| 14 | `customer_edited` | bool | no | false |  |  |  | True if the customer changed the value that was read. |
| 15 | `customer_edit_reason` | text | yes |  |  |  |  | The customer's reason for changing the value. |
| 16 | `original_value` | text | yes |  |  |  |  | The value as first read, kept when the customer edits it. |
| 17 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `documents` via `document_id` (one-to-many, 1 : 0..N; required)

### document_readings

What each document reader found for an application, one row per application and reader type. It is a snapshot that a new reading overwrites; the readers save here so results are in the database, not only in S3.

Created in `052_auto_document_checks.sql`; 4 columns; primary key (application_id, reader_type).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The application the reading is for. |
| 2 | `reader_type` | varchar | no |  | PK |  |  | Which reader produced it: pan_card \| aadhaar_card \| salary_slip \| form16 \| bank_statement. |
| 3 | `fields` | jsonb | no |  |  |  |  | Everything the reader found, as field name to value and confidence. |
| 4 | `read_at` | timestamptz | no | now() |  |  |  | When the reader saved this result. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### document_check_rules

Settings for the automatic document checks, one row per document type and check. Staff with policy.author edit it and every change is audited; it is read only through functions.

Created in `052_auto_document_checks.sql`; 12 columns; primary key (doc_type, check_code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `doc_type` | varchar | no |  | PK, FK | document_types.code |  | Document type the check applies to, from document_types. |
| 2 | `check_code` | varchar | no |  | PK |  |  | Short code for the check, e.g. a PAN, name, date of birth, face or recency check. |
| 3 | `label` | text | no |  |  |  |  | Plain name of the check shown to staff. |
| 4 | `enabled` | bool | no | true |  |  |  | True if the check runs. Default true. |
| 5 | `blocking` | bool | no | true |  |  |  | True if the check must pass for the document to be accepted automatically. Default true. |
| 6 | `threshold` | numeric | yes |  |  |  |  | Pass mark for the check; what it means depends on the check (see threshold_hint). |
| 7 | `threshold_hint` | text | yes |  |  |  |  | Plain note explaining what the threshold number means for this check. |
| 8 | `on_fail` | varchar | no | 'REVIEW' |  |  | REVIEW \| ASK_CUSTOMER | What happens on a fail: REVIEW (a person looks) \| ASK_CUSTOMER (customer uploads again). Default REVIEW. |
| 9 | `customer_message` | text | yes |  |  |  |  | What the customer is told when on_fail is ASK_CUSTOMER. |
| 10 | `sort_order` | int2 | no | 100 |  |  |  | Order the checks are listed in. Default 100. |
| 11 | `updated_by` | uuid | yes |  |  |  |  | Staff member who last changed the rule. |
| 12 | `updated_at` | timestamptz | no | now() |  |  |  | When the rule was last changed. |

Relationships:
- belongs to `document_types` via `doc_type` (one-to-many, 1 : 0..N; required)

Triggers: `trg_team_journal`.

### document_check_results

Latest outcome of each automatic check, one row per application, document type and check. Written only by the check engine; a re-run overwrites the row.

Created in `052_auto_document_checks.sql`; 6 columns; primary key (application_id, doc_type, check_code); about 32 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The application checked. |
| 2 | `doc_type` | varchar | no |  | PK |  |  | Document type checked. |
| 3 | `check_code` | varchar | no |  | PK |  |  | Which check ran, matching document_check_rules. |
| 4 | `result` | varchar | no |  |  |  | PASS \| FAIL \| UNREAD \| WAITING | Outcome: PASS \| FAIL \| UNREAD (the reader could not tell) \| WAITING. |
| 5 | `detail` | text | yes |  |  |  |  | Plain explanation of the outcome, e.g. what did not match. |
| 6 | `checked_at` | timestamptz | no | now() |  |  |  | When the check last ran. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### document_auto_settings

Single-row settings table that switches the automatic document checks, and each automatic step after them, on or off. Edited by staff with policy.author; changes are audited.

Created in `052_auto_document_checks.sql`; 8 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | bool | no | true | PK |  |  | Always true; keeps the table to one row. |
| 2 | `enabled` | bool | no | true |  |  |  | True to run the automatic checks at all. Default true. |
| 3 | `auto_accept` | bool | no | true |  |  |  | True to accept documents that pass every blocking check. Default true. |
| 4 | `auto_verify` | bool | no | true |  |  |  | True to move the case on once every needed document is accepted. Default true. |
| 5 | `auto_credit_checks` | bool | no | true |  |  |  | True to then run the credit checks automatically. Default true. |
| 6 | `reader_wait_minutes` | int2 | no | 30 |  |  |  | Minutes to wait for a reader; after this an unread document counts as unreadable. 1 to 1440, default 30. |
| 7 | `updated_by` | uuid | yes |  |  |  |  | Staff member who last changed the settings. |
| 8 | `updated_at` | timestamptz | no | now() |  |  |  | When the settings were last changed. |

Triggers: `trg_team_journal`.

### document_auto_policy

Which document types are accepted automatically when their checks pass, one row per type. Types with no reader yet, or dealer papers, are set to need a person.

Created in `052_auto_document_checks.sql`; 5 columns; primary key (doc_type).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `doc_type` | varchar | no |  | PK, FK | document_types.code |  | Document type, from document_types. |
| 2 | `auto_accept` | bool | no |  |  |  |  | True if this type is accepted on its own when its blocking checks pass. |
| 3 | `note` | text | yes |  |  |  |  | Why it is not automatic, e.g. 'No reader yet' or 'Dealer paper, checked by a person'. |
| 4 | `updated_by` | uuid | yes |  |  |  |  | Staff member who last changed it. |
| 5 | `updated_at` | timestamptz | no | now() |  |  |  | When it was last changed. |

Relationships:
- belongs to `document_types` via `doc_type` (one-to-one, 1 : 0..1; required)

Triggers: `trg_team_journal`.

### kyc_face_matches

One row per face comparison run on a KYC card (PAN or Aadhaar) for an application. Each new check adds a row; the latest is used.

Created in `046_customer_details_submit.sql`; 7 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application the face check is for. |
| 3 | `doc_type` | varchar | no |  |  |  |  | Card whose photo was compared: PAN \| AADHAAR. |
| 4 | `side` | varchar | no |  |  |  |  | Which side of the card was used (front, back or single). |
| 5 | `similarity` | numeric | yes |  |  |  |  | Match score from the face-matching service, 0 to 100. Empty when no face was found. |
| 6 | `result` | varchar | no |  |  |  | MATCH \| REVIEW \| MISMATCH \| NO_FACE | Outcome: MATCH \| REVIEW \| MISMATCH \| NO_FACE. |
| 7 | `checked_at` | timestamptz | no | now() |  |  |  | When the comparison ran. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### document_storage_deletions

Queue of stored files to delete after a customer's data is erased, one row per file. Filled by the erasure function; an operator deletes each file from storage and marks it done.

Created in `080_data_erasure.sql`; 7 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `request_id` | uuid | no |  | FK | erasure_requests.id |  | The erasure request that queued this file. |
| 3 | `storage_backend` | varchar | yes |  |  |  |  | Where the file is kept, e.g. s3 or supabase, copied from the document. |
| 4 | `storage_key` | text | yes |  |  |  |  | The file's key in storage, copied from the document. |
| 5 | `file_path` | text | yes |  |  |  |  | The file's path, copied from the document. |
| 6 | `queued_at` | timestamptz | no | now() |  |  |  | When the file was queued for deletion. |
| 7 | `deleted_at` | timestamptz | yes |  |  |  |  | When the file was confirmed deleted from storage. Empty means still to do; automatic S3 deletion is not built yet. |

Relationships:
- belongs to `erasure_requests` via `request_id` (one-to-many, 1 : 0..N; required)

## Credit bureau

### bureau_reports

The credit bureau result the decision engine reads, one row per application for current pulls. For a two-bureau pull it holds the COMBINED result, still named 'CIBIL-SIMULATED'; older rows are kept as they were.

Created in `001_schema.sql`; 28 columns; primary key (id); about 2,021 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application the bureau result is for. |
| 3 | `customer_id` | uuid | no |  | FK | customers.id |  | The customer the report is about. |
| 4 | `bureau_name` | varchar | no |  |  |  |  | Bureau label, e.g. CIBIL-SIMULATED for current combined pulls, CIBIL for older staff rows. |
| 5 | `score` | int2 | yes |  |  |  |  | Credit score used by the engine: CIBIL's, or the other bureau's when CIBIL has no record. |
| 6 | `score_date` | date | yes |  |  |  |  | Date of the score. |
| 7 | `active_accounts` | int2 | yes |  |  |  |  | Number of active loans, cards and overdrafts counted. |
| 8 | `total_outstanding` | numeric | yes |  |  |  |  | Total balance owed on counted accounts, in INR. |
| 9 | `total_monthly_emi` | numeric | yes |  |  |  |  | Monthly obligation in INR: EMIs plus 5% of card and overdraft balances. |
| 10 | `dpd_max_12m` | int2 | yes |  |  |  |  | Worst days past due in the last 12 months. |
| 11 | `dpd_max_24m` | int2 | yes |  |  |  |  | Worst days past due in the last 24 months. |
| 12 | `dpd_30_count_24m` | int2 | yes |  |  |  |  | Number of months in the last 24 with a payment 30 or more days late. |
| 13 | `dpd_60_plus_flag` | bool | yes |  |  |  |  | True if any payment was 60 or more days late, or an account is SUB, DBT or LSS. |
| 14 | `enquiry_count_90d` | int2 | yes |  |  |  |  | Number of credit enquiries in the last 90 days. |
| 15 | `writeoff_count_5y` | int2 | yes |  |  |  |  | Number of written-off accounts in the last 5 years. |
| 16 | `settled_count_5y` | int2 | yes |  |  |  |  | Number of settled accounts in the last 5 years. |
| 17 | `credit_utilization_pct` | numeric | yes |  |  |  |  | Card balances as a % of card limits, counting only cards with a limit reported. |
| 18 | `oldest_account_months` | int2 | yes |  |  |  |  | Age of the oldest account, in months. |
| 19 | `report_raw_path` | text | yes |  |  |  |  | Where the raw bureau response is kept. Blanked on data erasure. |
| 20 | `extracted_at` | timestamptz | yes |  |  |  |  | When the figures were taken from the report. |
| 21 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 22 | `report_ref` | varchar | yes |  |  |  |  | The bureau's report number (ECN). |
| 23 | `pulled_at` | timestamptz | yes |  |  |  |  | When the bureau was pulled. |
| 24 | `valid_until` | date | yes |  |  |  |  | Last date the report can be relied on. |
| 25 | `consent_id` | uuid | yes |  | FK | customer_consents.id |  | The customer's bureau-pull consent this report was pulled under. |
| 26 | `no_hit` | bool | yes |  |  |  |  | True if no bureau had a record for the customer. |
| 27 | `score_source` | varchar | yes |  |  |  |  | Which bureau the score came from, e.g. CIBIL or EXPERIAN. |
| 28 | `bureau_count` | int2 | yes |  |  |  |  | Number of bureaus pulled for this result. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `customer_consents` via `consent_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)

### bureau_summary

Figures worked out from a bureau pull, one row per bureau pulled (hit or not) plus one COMBINED row per application. Written only by the bureau engine; COMBINED takes the worse of the two bureaus for bad marks.

Created in `053_bureau_detail.sql`; 67 columns; primary key (application_id, bureau); about 6,039 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The application the pull is for. |
| 2 | `bureau` | varchar | no |  | PK |  | CIBIL \| EXPERIAN \| EQUIFAX \| CRIF \| COMBINED | Which bureau: CIBIL \| EXPERIAN \| EQUIFAX \| CRIF \| COMBINED. |
| 3 | `report_ref` | varchar | yes |  |  |  |  | The bureau's report number (ECN). |
| 4 | `pulled_at` | timestamptz | yes |  |  |  |  | When the bureau was pulled. |
| 5 | `valid_until` | date | yes |  |  |  |  | Last date the report can be relied on. |
| 6 | `consent_id` | uuid | yes |  | FK | customer_consents.id |  | The customer's consent the pull was made under. |
| 7 | `raw_key` | text | yes |  |  |  |  | Where the raw bureau response is kept. |
| 8 | `grid_month` | date | yes |  |  |  |  | The newest month in this bureau's late-payment grids. |
| 9 | `no_hit` | bool | no |  |  |  |  | True if the bureau had no record. Then score, active accounts, obligation and worst DPD must be empty. |
| 10 | `score` | int2 | yes |  |  |  |  | Credit score, 300 to 900. COMBINED uses CIBIL's, or the other bureau's when CIBIL has no record. |
| 11 | `score_source` | varchar | yes |  |  |  |  | Bureau the score came from. |
| 12 | `bureau_count` | int2 | yes |  |  |  |  | Number of bureaus behind this row: 1 for a single bureau, all pulled for COMBINED. |
| 13 | `score_gap` | int2 | yes |  |  |  |  | Points between the two bureaus' scores, on the COMBINED row. |
| 14 | `score_gap_flag` | bool | yes |  |  |  |  | True if the score gap is more than 50 points. |
| 15 | `active_loans` | int2 | yes |  |  |  |  | Active non-card, non-overdraft loans counted (individual or joint, not corporate). |
| 16 | `active_cards` | int2 | yes |  |  |  |  | Active credit cards counted. |
| 17 | `active_overdrafts` | int2 | yes |  |  |  |  | Active overdrafts counted. |
| 18 | `active_accounts` | int2 | yes |  |  |  |  | Active accounts counted in total. COMBINED treats a matched loan as active if either bureau shows it active. |
| 19 | `closed_accounts` | int2 | yes |  |  |  |  | Accounts no longer active (closed, written off or settled). |
| 20 | `corporate_cards` | int2 | yes |  |  |  |  | Active corporate cards; shown but not counted in obligations. |
| 21 | `guarantor_accounts` | int2 | yes |  |  |  |  | Accounts held as guarantor or authorised user; shown, not counted, but their bad marks count. |
| 22 | `loan_balance` | int4 | yes |  |  |  |  | Balance owed on counted loans, in INR. |
| 23 | `loan_sanctioned` | int4 | yes |  |  |  |  | Amount sanctioned on counted loans, in INR. |
| 24 | `card_balance` | int4 | yes |  |  |  |  | Balance on counted cards that report a limit, in INR. |
| 25 | `card_limit` | int4 | yes |  |  |  |  | Total limit of counted cards that report one, in INR. |
| 26 | `credit_utilization_pct` | numeric | yes |  |  |  |  | Card balance as a % of card limit. |
| 27 | `total_outstanding` | int4 | yes |  |  |  |  | Total balance owed on all counted accounts, in INR. |
| 28 | `overdue_amount` | int4 | yes |  |  |  |  | Overdue amount on accounts not closed, in INR. |
| 29 | `instalment_emi` | int4 | yes |  |  |  |  | Monthly EMIs on counted loans, in INR. |
| 30 | `revolving_obligation` | int4 | yes |  |  |  |  | 5% of card and overdraft balances, in INR, counted as a monthly obligation. |
| 31 | `monthly_obligation` | int4 | yes |  |  |  |  | Instalment EMI plus revolving obligation when revolving_counted is true, in INR. The table enforces this sum. |
| 32 | `revolving_counted` | bool | no | fn_bureau_revolving_in_foir() |  |  |  | Whether the 5% card and overdraft share was included in the obligation when this row was worked out. |
| 33 | `emi_ending_3m` | int4 | yes |  |  |  |  | EMIs of loans ending within 3 months, in INR. Shown only; still counted in the obligation. |
| 34 | `dpd_max_3m` | int2 | yes |  |  |  |  | Worst days past due in the last 3 months. |
| 35 | `dpd_max_6m` | int2 | yes |  |  |  |  | Worst days past due in the last 6 months. |
| 36 | `dpd_max_12m` | int2 | yes |  |  |  |  | Worst days past due in the last 12 months. |
| 37 | `dpd_max_24m` | int2 | yes |  |  |  |  | Worst days past due in the last 24 months. |
| 38 | `dpd_max_36m` | int2 | yes |  |  |  |  | Worst days past due in the last 36 months. |
| 39 | `dpd_30_count_24m` | int2 | yes |  |  |  |  | Account-months in the last 24 with a payment 30 or more days late. |
| 40 | `dpd_60_plus_flag` | bool | yes |  |  |  |  | True if any payment was 60+ days late within 36 months, or any account is SUB, DBT or LSS. |
| 41 | `minor_dpd_months_7to12` | int2 | yes |  |  |  |  | Months 7 to 12 back where the worst lateness was 1 to 30 days. |
| 42 | `on_time_pct_24m` | numeric | yes |  |  |  |  | % of reported months in the last 24 paid on time (0 days late). |
| 43 | `sma0_count` | int2 | yes |  |  |  |  | Counted accounts currently 1 to 30 days late. |
| 44 | `sma1_count` | int2 | yes |  |  |  |  | Counted accounts currently 31 to 60 days late. |
| 45 | `sma2_count` | int2 | yes |  |  |  |  | Counted accounts currently 61 to 90 days late. |
| 46 | `sub_count` | int2 | yes |  |  |  |  | Accounts in asset class SUB (substandard). |
| 47 | `dbt_count` | int2 | yes |  |  |  |  | Accounts in asset class DBT (doubtful). |
| 48 | `lss_count` | int2 | yes |  |  |  |  | Accounts in asset class LSS (loss). |
| 49 | `secured_count` | int2 | yes |  |  |  |  | Counted secured accounts. |
| 50 | `unsecured_count` | int2 | yes |  |  |  |  | Counted unsecured accounts. |
| 51 | `secured_balance` | int4 | yes |  |  |  |  | Balance on counted secured accounts, in INR. |
| 52 | `unsecured_balance` | int4 | yes |  |  |  |  | Balance on counted unsecured accounts, in INR. |
| 53 | `opened_6m` | int2 | yes |  |  |  |  | Non-corporate accounts opened in the last 6 months. |
| 54 | `opened_12m` | int2 | yes |  |  |  |  | Non-corporate accounts opened in the last 12 months. |
| 55 | `restructured_count` | int2 | yes |  |  |  |  | Accounts marked restructured. |
| 56 | `writeoff_count_5y` | int2 | yes |  |  |  |  | Accounts written off (status or amount) in the last 5 years. |
| 57 | `settled_count_5y` | int2 | yes |  |  |  |  | Accounts settled (status or amount) in the last 5 years. |
| 58 | `suit_count` | int2 | yes |  |  |  |  | Accounts where a suit has been filed. |
| 59 | `stale_lender_accounts` | int2 | yes |  |  |  |  | Accounts with lenders whose licence is cancelled; shown as a data issue. |
| 60 | `enquiry_count_30d` | int2 | yes |  |  |  |  | Credit enquiries in the last 30 days. |
| 61 | `enquiry_count_90d` | int2 | yes |  |  |  |  | Credit enquiries in the last 90 days. |
| 62 | `enquiry_count_12m` | int2 | yes |  |  |  |  | Credit enquiries in the last 12 months. |
| 63 | `unsecured_enquiry_90d` | int2 | yes |  |  |  |  | Enquiries in the last 90 days for products other than auto, home, property, two-wheeler or gold. |
| 64 | `auto_enquiry_30d` | int2 | yes |  |  |  |  | Car loan enquiries in the last 30 days. |
| 65 | `oldest_account_months` | int2 | yes |  |  |  |  | Age of the oldest account, in months. |
| 66 | `one_bureau_accounts` | int2 | yes |  |  |  |  | Accounts found on only one bureau, not matched to the other. |
| 67 | `computed_at` | timestamptz | no | now() |  |  |  | When the figures were worked out. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `customer_consents` via `consent_id` (one-to-many, 0..1 : 0..N; optional)
- has `bureau_accounts` rows via `bureau_accounts.application_id, bureau` (one-to-many, 1 : 0..N)
- has `bureau_enquiries` rows via `bureau_enquiries.application_id, bureau` (one-to-many, 1 : 0..N)

### bureau_accounts

Every credit account reported by a bureau pull, one row per account per bureau, with a 24-month late-payment grid. Written by the bureau engine; deleted with its summary row.

Created in `053_bureau_detail.sql`; 38 columns; primary key (application_id, bureau, seq); about 14,922 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | bureau_summary.application_id |  | The application the pull is for. |
| 2 | `bureau` | varchar | no |  | PK, FK | bureau_summary.bureau | CIBIL \| EXPERIAN \| EQUIFAX \| CRIF | Bureau that reported it: CIBIL \| EXPERIAN \| EQUIFAX \| CRIF. |
| 3 | `seq` | int2 | no |  | PK |  |  | Position of the account within this bureau's report. |
| 4 | `merged_seq` | int2 | yes |  |  |  |  | Shared number when the same loan appears on both bureaus, so it counts once. |
| 5 | `lender_raw` | varchar | no |  |  |  |  | Lender name as the bureau printed it. |
| 6 | `lender_code` | varchar | no |  |  |  |  | Matched lender code; '~' plus a key when the lender is not known yet. |
| 7 | `product_raw` | varchar | no |  |  |  |  | Product name as the bureau printed it. |
| 8 | `product` | varchar | no |  |  |  |  | Standard product code from bureau_product_map, e.g. AUTO, HOME, PERSONAL, CARD, OVERDRAFT. |
| 9 | `secured` | bool | no |  |  |  |  | True if the account is backed by security. |
| 10 | `revolving` | bool | no |  |  |  |  | True for cards and overdrafts. |
| 11 | `corporate` | bool | no |  |  |  |  | True for a corporate card; shown but not counted. |
| 12 | `account_masked` | varchar | yes |  |  |  |  | Account number with most digits hidden. |
| 13 | `ownership` | varchar | no |  |  |  | INDIVIDUAL \| JOINT \| GUARANTOR \| AUTHORISED | Holding type: INDIVIDUAL \| JOINT \| GUARANTOR \| AUTHORISED. Only individual and joint are counted. |
| 14 | `status` | varchar | no |  |  |  | ACTIVE \| CLOSED \| WRITTEN_OFF \| SETTLED | Account state: ACTIVE \| CLOSED \| WRITTEN_OFF \| SETTLED. |
| 15 | `asset_class` | varchar | no |  |  |  | STD \| SMA0 \| SMA1 \| SMA2 \| SUB \| DBT \| LSS | Current asset class only: STD \| SMA0 \| SMA1 \| SMA2 \| SUB \| DBT \| LSS. |
| 16 | `restructured` | bool | no |  |  |  |  | True if the loan was restructured. |
| 17 | `suit_filed` | bool | no |  |  |  |  | True if the lender has filed a suit. |
| 18 | `sanctioned` | int4 | yes |  |  |  |  | Amount sanctioned, in INR. |
| 19 | `credit_limit` | int4 | yes |  |  |  |  | Card or overdraft limit, in INR. |
| 20 | `cash_limit` | int4 | yes |  |  |  |  | Cash withdrawal limit on a card, in INR. |
| 21 | `outstanding` | int4 | no |  |  |  |  | Balance owed, in INR; cannot be negative. |
| 22 | `overdue` | int4 | no |  |  |  |  | Amount overdue, in INR; cannot be negative. |
| 23 | `emi` | int4 | yes |  |  |  |  | Instalment amount per payment period, in INR. |
| 24 | `frequency` | bpchar | no |  |  |  | M \| B \| Q \| H \| Y \| F \| W | How often the instalment is due: M \| B \| Q \| H \| Y \| F \| W. |
| 25 | `rate_pct` | numeric | yes |  |  |  |  | Interest rate, in %. |
| 26 | `tenure_months` | int2 | yes |  |  |  |  | Loan term, in months. |
| 27 | `collateral` | varchar | yes |  |  |  |  | Type of security held against the loan. |
| 28 | `collateral_value` | int4 | yes |  |  |  |  | Value of the security, in INR. |
| 29 | `opened_on` | date | no |  |  |  |  | Date the account was opened. |
| 30 | `last_payment_on` | date | yes |  |  |  |  | Date of the last payment. |
| 31 | `last_payment_amount` | int4 | yes |  |  |  |  | Amount of the last payment, in INR. |
| 32 | `closed_on` | date | yes |  |  |  |  | Date the account was closed. |
| 33 | `reported_on` | date | no |  |  |  |  | Date the lender last reported the account. |
| 34 | `writeoff_amount` | int4 | yes |  |  |  |  | Amount written off, in INR. |
| 35 | `settled_amount` | int4 | yes |  |  |  |  | Amount accepted in settlement, in INR. |
| 36 | `grid_month` | date | no |  |  |  |  | Month of the first grid cell; always the 1st of a month. |
| 37 | `dpd` | int2[] | no |  |  |  |  | Days past due for 24 months, newest first; -1 means not reported. Values -1 to 999. |
| 38 | `dpd_max_25_36m` | int2 | no |  |  |  |  | Worst days past due in the 12 months before the grid; -1 means none reported. |

Relationships:
- belongs to `bureau_summary` via `application_id, bureau` (one-to-many, 1 : 0..N; required)

### bureau_enquiries

Every credit enquiry a bureau reports, one row per enquiry per bureau pull. Written by the bureau engine; deleted with its summary row.

Created in `053_bureau_detail.sql`; 9 columns; primary key (application_id, bureau, seq); about 6,511 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | bureau_summary.application_id |  | The application the pull is for. |
| 2 | `bureau` | varchar | no |  | PK, FK | bureau_summary.bureau | CIBIL \| EXPERIAN \| EQUIFAX \| CRIF | Bureau that reported it: CIBIL \| EXPERIAN \| EQUIFAX \| CRIF. |
| 3 | `seq` | int2 | no |  | PK |  |  | Position of the enquiry within this bureau's report. |
| 4 | `enquired_on` | date | no |  |  |  |  | Date of the enquiry. |
| 5 | `lender_raw` | varchar | no |  |  |  |  | Lender name as the bureau printed it. |
| 6 | `lender_code` | varchar | no |  |  |  |  | Matched lender code. |
| 7 | `purpose` | varchar | no |  |  |  |  | Standard product code the enquiry was for, e.g. AUTO, PERSONAL, CARD. |
| 8 | `purpose_raw` | varchar | yes |  |  |  |  | Purpose as the bureau printed it. |
| 9 | `amount` | int4 | yes |  |  |  |  | Amount asked for, in INR. |

Relationships:
- belongs to `bureau_summary` via `application_id, bureau` (one-to-many, 1 : 0..N; required)

### bureau_lenders

Reference list of lenders that appear in bureau reports, one row per lender code. Seeded from the simulator; re-running the migration keeps admin changes.

Created in `053_bureau_detail.sql`; 5 columns; primary key (lender_code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `lender_code` | varchar | no |  | PK |  |  | Short lender code. |
| 2 | `lender_name` | varchar | no |  |  |  |  | Lender's full name. |
| 3 | `lender_kind` | varchar | no |  |  |  | BANK \| NBFC \| HFC \| MFI \| FINTECH | Kind of lender: BANK \| NBFC \| HFC \| MFI \| FINTECH. |
| 4 | `licence_cancelled` | bool | no | false |  |  |  | True if the lender's licence is cancelled; shown as a data issue, its bad marks still count. |
| 5 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed. |

Relationships:
- has `lender_aliases` rows via `lender_aliases.lender_code` (one-to-many, 1 : 0..N)

### lender_aliases

The different ways bureaus spell a lender's name, one row per spelling, each pointing to one lender code. Used to match the same loan across two bureaus.

Created in `053_bureau_detail.sql`; 4 columns; primary key (alias_key).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `alias_key` | varchar | no |  | PK |  |  | The name reduced to a standard key; must equal the key worked out from alias. |
| 2 | `alias` | varchar | no |  |  |  |  | Lender name as a bureau prints it. |
| 3 | `lender_code` | varchar | no |  | FK | bureau_lenders.lender_code |  | The lender this spelling belongs to, from bureau_lenders. |
| 4 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed. |

Relationships:
- belongs to `bureau_lenders` via `lender_code` (one-to-many, 1 : 0..N; required)

### bureau_product_map

Maps each product name a bureau prints to one standard product code, one row per bureau and name. A bureau-specific row wins over a '*' row for all bureaus; re-running keeps admin changes.

Created in `053_bureau_detail.sql`; 8 columns; primary key (bureau, raw_key).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `bureau` | varchar | no |  | PK |  | * \| CIBIL \| EXPERIAN \| EQUIFAX \| CRIF | Bureau the mapping is for: CIBIL \| EXPERIAN \| EQUIFAX \| CRIF \| * (all). |
| 2 | `raw_key` | varchar | no |  | PK |  |  | The printed name reduced to a standard key; must equal the key worked out from product_raw. |
| 3 | `product_raw` | varchar | no |  |  |  |  | Product name as the bureau prints it. |
| 4 | `product` | varchar | no |  |  |  | AUTO \| HOME \| PROPERTY \| PERSONAL \| CONSUMER \| EDUCATION \| TWO_WHEELER \| GOLD \| CARD \| CORP_CARD \| OVERDRAFT \| OTHER | Standard code: AUTO \| HOME \| PROPERTY \| PERSONAL \| CONSUMER \| EDUCATION \| TWO_WHEELER \| GOLD \| CARD \| CORP_CARD \| OVERDRAFT \| OTHER. |
| 5 | `secured` | bool | no |  |  |  |  | True if this product is secured. |
| 6 | `revolving` | bool | no |  |  |  |  | True for cards and overdrafts. |
| 7 | `corporate` | bool | no | false |  |  |  | True for corporate cards; only allowed when revolving is true. Default false. |
| 8 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed. |

## Income and banking

### income_assessments

One row is the income check for one loan application. It compares declared salary with the slip, bank credit and Form 16 figures and records the income the policy will count.

Created in `001_schema.sql`; 17 columns; primary key (id); about 1,705 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application this income check belongs to. |
| 3 | `declared_net_salary` | numeric | yes |  |  |  |  | Monthly take-home salary the customer declared on the application, in INR. |
| 4 | `salary_slip_salary` | numeric | yes |  |  |  |  | Monthly net salary read from the salary slips, in INR. |
| 5 | `bank_credit_salary` | numeric | yes |  |  |  |  | Monthly salary credit seen in the bank statement, in INR. |
| 6 | `form16_annual_income` | numeric | yes |  |  |  |  | Annual income shown on Form 16, in INR. |
| 7 | `form16_monthly_equiv` | numeric | yes |  |  |  |  | Form 16 annual income divided into a monthly figure, in INR. |
| 8 | `income_variance_pct` | numeric | yes |  |  |  |  | How far apart the income sources are, in %. |
| 9 | `income_variance_flag` | bool | no | false |  |  |  | True when the gap between income sources is large enough to flag. Defaults to false. |
| 10 | `eligible_net_salary` | numeric | yes |  |  |  |  | Monthly salary the policy will count towards eligibility, in INR. |
| 11 | `declared_other_income` | numeric | yes |  |  |  |  | Other monthly income the customer declared (rent, interest and so on), in INR. |
| 12 | `eligible_other_income` | numeric | yes |  |  |  |  | Part of the other income the policy will count, in INR per month. |
| 13 | `total_eligible_income` | numeric | yes |  |  |  |  | Eligible salary plus eligible other income, in INR per month. |
| 14 | `employer_name_match` | bool | yes |  |  |  |  | True when the employer name matches across the documents. |
| 15 | `name_match_score` | numeric | yes |  |  |  |  | Score for how closely the names match across documents, in %. |
| 16 | `assessment_date` | date | yes |  |  |  |  | Date the income check was done. |
| 17 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### salary_slips

One row is one month's salary slip for an application, usually the last 3 months. Added in 054 so the credit checks see the detail behind the slip net figure; staff read it only through the summary functions.

Created in `054_income_bank_detail.sql`; 26 columns; primary key (application_id, pay_month); about 5,664 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The loan application the slip belongs to. With pay_month, it forms the key. |
| 2 | `pay_month` | date | no |  | PK |  |  | The month the slip is for, stored as the 1st of that month (enforced). |
| 3 | `employer_name` | varchar | yes |  |  |  |  | Employer name printed on the slip. |
| 4 | `employee_name` | varchar | yes |  |  |  |  | Employee name printed on the slip. |
| 5 | `employee_id` | varchar | yes |  |  |  |  | Employee number printed on the slip. |
| 6 | `designation` | varchar | yes |  |  |  |  | Job title printed on the slip. |
| 7 | `uan` | varchar | yes |  |  |  |  | Provident fund Universal Account Number on the slip, up to 12 characters. |
| 8 | `pan_last4` | varchar | yes |  |  |  |  | Last 4 characters of the PAN on the slip. |
| 9 | `gross` | int4 | no |  |  |  |  | Gross monthly earnings, in INR. Must be 0 or more. |
| 10 | `basic` | int4 | yes |  |  |  |  | Basic pay, in INR. |
| 11 | `hra` | int4 | yes |  |  |  |  | House rent allowance, in INR. |
| 12 | `other_earnings` | int4 | yes |  |  |  |  | Other earnings lines added together, in INR. |
| 13 | `pf` | int4 | no | 0 |  |  |  | Provident fund deduction, in INR. Must be 0 or more. |
| 14 | `professional_tax` | int4 | no | 0 |  |  |  | Professional tax deduction, in INR. Must be 0 or more. |
| 15 | `tds` | int4 | no | 0 |  |  |  | Income tax deducted at source, in INR. Must be 0 or more. |
| 16 | `esi` | int4 | no | 0 |  |  |  | Employee State Insurance deduction, in INR. Must be 0 or more. |
| 17 | `employer_loan_recovery` | int4 | no | 0 |  |  |  | Loan repayment the employer takes from salary, in INR. Must be 0 or more. |
| 18 | `other_deductions` | int4 | no | 0 |  |  |  | Other deductions added together, in INR. Must be 0 or more. |
| 19 | `net` | int4 | no |  |  |  |  | Net pay, in INR. Unless read by the document reader, must equal gross minus all deductions, within 1 rupee. |
| 20 | `net_in_words_matches` | bool | yes |  |  |  |  | True when the net pay written in words matches the figure. |
| 21 | `lop_days` | numeric | no | 0 |  |  |  | Loss-of-pay days in the month, between 0 and 31. |
| 22 | `arrears` | int4 | no | 0 |  |  |  | Arrears paid in this slip, in INR. Must be 0 or more. |
| 23 | `bank_last4` | varchar | yes |  |  |  |  | Last 4 digits of the bank account the salary is paid into. |
| 24 | `housing_loan_line` | bool | no | false |  |  |  | True when the slip shows a housing loan line. Defaults to false. |
| 25 | `source` | varchar | no |  |  |  | READER \| SIMULATED \| STAFF | Where the row came from: READER \| SIMULATED \| STAFF. |
| 26 | `recorded_at` | timestamptz | no | now() |  |  |  | When the row was recorded |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### form16_part_b

One row per application holds the Form 16 Part B annual income certificate. Added in 054; a negative house-property income here is how a home loan the bureau does not show turns up.

Created in `054_income_bank_detail.sql`; 18 columns; primary key (application_id); about 1,888 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The loan application this Form 16 belongs to. One row per application. |
| 2 | `certificate_no` | varchar | yes |  |  |  |  | Form 16 certificate number. |
| 3 | `assessment_year` | varchar | no |  |  |  |  | Tax assessment year, written like 2026-27 (format enforced). |
| 4 | `employer_name` | varchar | yes |  |  |  |  | Employer name on the form. |
| 5 | `employer_tan` | varchar | yes |  |  |  |  | Employer's tax deduction account number (TAN). |
| 6 | `employee_pan_last4` | varchar | yes |  |  |  |  | Last 4 characters of the employee's PAN. |
| 7 | `period_from` | date | yes |  |  |  |  | Start of the employment period the form covers. |
| 8 | `period_to` | date | yes |  |  |  |  | End of the employment period the form covers. |
| 9 | `other_employer_salary` | int4 | no | 0 |  |  |  | Salary from another employer in the same year, in INR. Defaults to 0. |
| 10 | `income_under_salaries` | int4 | yes |  |  |  |  | Income chargeable under the head Salaries, in INR per year. |
| 11 | `house_property_income` | int4 | no | 0 |  |  |  | Income from house property, in INR. Negative means a loss, which is interest on a home loan. |
| 12 | `deduction_80e` | int4 | no | 0 |  |  |  | Section 80E deduction for education loan interest, in INR. Defaults to 0. |
| 13 | `gross_total_income` | int4 | no |  |  |  |  | Gross total income for the year, in INR. |
| 14 | `taxable_income` | int4 | yes |  |  |  |  | Taxable income for the year, in INR. |
| 15 | `net_tax` | int4 | yes |  |  |  |  | Net tax payable for the year, in INR. |
| 16 | `signature_valid` | bool | yes |  |  |  |  | True when the digital signature on the form checks out. |
| 17 | `source` | varchar | no |  |  |  | READER \| SIMULATED \| STAFF | Where the row came from: READER \| SIMULATED \| STAFF. |
| 18 | `recorded_at` | timestamptz | no | now() |  |  |  | When the row was recorded |

Relationships:
- belongs to `applications` via `application_id` (one-to-one, 1 : 0..1; required)

### bank_statement_analyses

One row is the analysis of one bank statement for an application: balances, salary credits, EMIs, bounces and cash deposits. Bank transactions and the credit checks hang off it.

Created in `001_schema.sql`; 30 columns; primary key (id); about 1,705 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application the statement belongs to. |
| 3 | `customer_id` | uuid | no |  | FK | customers.id |  | The customer who owns the account. |
| 4 | `bank_name` | varchar | yes |  |  |  |  | Name of the bank. |
| 5 | `account_number_last4` | varchar | yes |  |  |  |  | Last 4 digits of the account number. |
| 6 | `statement_from` | date | no |  |  |  |  | First date the statement covers. |
| 7 | `statement_to` | date | no |  |  |  |  | Last date the statement covers. |
| 8 | `months_covered` | int2 | no |  |  |  |  | Number of months the statement covers. |
| 9 | `avg_monthly_balance` | numeric | yes |  |  |  |  | Average monthly balance over the statement, in INR. |
| 10 | `amb_on_5th` | numeric | yes |  |  |  |  | Average balance on the 5th of each month, in INR. |
| 11 | `amb_on_10th` | numeric | yes |  |  |  |  | Average balance on the 10th of each month, in INR. |
| 12 | `amb_on_15th` | numeric | yes |  |  |  |  | Average balance on the 15th of each month, in INR. |
| 13 | `amb_on_20th` | numeric | yes |  |  |  |  | Average balance on the 20th of each month, in INR. |
| 14 | `amb_on_25th` | numeric | yes |  |  |  |  | Average balance on the 25th of each month, in INR. |
| 15 | `min_amb_5dates` | numeric | yes |  |  |  |  | Lowest of the five date-wise average balances, in INR. |
| 16 | `avg_salary_credit` | numeric | yes |  |  |  |  | Average monthly salary credit, in INR. |
| 17 | `salary_regularity` | varchar | yes |  |  |  |  | How regular salary credits are; seed data uses values such as REGULAR and MOSTLY_REGULAR. |
| 18 | `total_emi_debits` | numeric | yes |  |  |  |  | Total monthly EMI debits seen on the statement, in INR. |
| 19 | `bounce_count_6m` | int2 | yes |  |  |  |  | Number of bounced debits in the last 6 months. |
| 20 | `cash_deposit_total_6m` | numeric | yes |  |  |  |  | Total cash deposited in the last 6 months, in INR. |
| 21 | `cash_deposit_proof_status` | varchar | yes |  |  |  |  | Status of the proof for the cash deposits. |
| 22 | `cash_deposit_proof_type` | varchar | yes |  |  |  |  | Kind of document given as proof for the cash deposits. |
| 23 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 24 | `source` | varchar | yes |  |  |  |  | Where the statement figures came from. Added in 054. |
| 25 | `holder_name_match_pct` | int2 | yes |  |  |  |  | How closely the account holder's name matches the customer, in %. Added in 054. |
| 26 | `primary_holder` | bool | yes |  |  |  |  | True when the customer is the primary holder of the account. Added in 054. |
| 27 | `account_opened_on` | date | yes |  |  |  |  | Date the bank account was opened. Added in 054. |
| 28 | `ifsc` | varchar | yes |  |  |  |  | IFSC code of the bank branch, 11 characters. Added in 054. |
| 29 | `opening_balance` | numeric | yes |  |  |  |  | Balance at the start of the statement, in INR. Added in 054. |
| 30 | `closing_balance` | numeric | yes |  |  |  |  | Balance at the end of the statement, in INR. Added in 054. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)
- has `bank_transactions` rows via `bank_transactions.analysis_id` (one-to-many, 1 : 0..N)

### bank_monthly_summary

One row is one month of an application's bank statement: salary credit and day, EMI debits, bounces and balances on set dates. Added in 054 so the credit checks see month-by-month detail.

Created in `054_income_bank_detail.sql`; 19 columns; primary key (application_id, month); about 11,328 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The loan application this month belongs to. With month, it forms the key. |
| 2 | `month` | date | no |  | PK |  |  | The month summarised, stored as the 1st of that month (enforced). |
| 3 | `salary_credit` | int4 | no | 0 |  |  |  | Salary credited in the month, in INR. Defaults to 0. |
| 4 | `salary_day` | int2 | yes |  |  |  |  | Day of the month the salary arrived, 1 to 31. |
| 5 | `emi_debits` | int4 | no | 0 |  |  |  | Total EMI debits in the month, in INR. Defaults to 0. |
| 6 | `emi_debit_count` | int2 | no | 0 |  |  |  | Number of EMI debits in the month. |
| 7 | `bounces` | int2 | no | 0 |  |  |  | Number of bounced debits in the month. |
| 8 | `balance_5th` | int4 | yes |  |  |  |  | Balance on the 5th of the month, in INR. |
| 9 | `balance_10th` | int4 | yes |  |  |  |  | Balance on the 10th of the month, in INR. |
| 10 | `balance_15th` | int4 | yes |  |  |  |  | Balance on the 15th of the month, in INR. |
| 11 | `balance_20th` | int4 | yes |  |  |  |  | Balance on the 20th of the month, in INR. |
| 12 | `balance_25th` | int4 | yes |  |  |  |  | Balance on the 25th of the month, in INR. |
| 13 | `avg_balance` | int4 | yes |  |  |  |  | Average balance for the month, in INR. |
| 14 | `min_balance_breaches` | int2 | no | 0 |  |  |  | How many of the five set dates fell below the minimum balance, 0 to 5. |
| 15 | `cash_deposits` | int4 | no | 0 |  |  |  | Cash deposited in the month, in INR. Defaults to 0. |
| 16 | `large_credits` | int2 | no | 0 |  |  |  | Number of unusually large credits in the month. |
| 17 | `closing_balance` | int4 | yes |  |  |  |  | Balance at month end, in INR. |
| 18 | `source` | varchar | no |  |  |  | READER \| SIMULATED \| STAFF | Where the row came from: READER \| SIMULATED \| STAFF. |
| 19 | `recorded_at` | timestamptz | no | now() |  |  |  | When the row was recorded |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### bank_transactions

One row is a single transaction line from an analysed bank statement. It holds the raw debits and credits behind the statement analysis.

Created in `001_schema.sql`; 12 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `analysis_id` | uuid | no |  | FK | bank_statement_analyses.id |  | The bank statement analysis this transaction belongs to. |
| 3 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application the statement belongs to. |
| 4 | `txn_date` | date | no |  |  |  |  | Date of the transaction. |
| 5 | `txn_type` | varchar | no |  |  |  |  | Whether money came in or went out (debit or credit). |
| 6 | `amount` | numeric | no |  |  |  |  | Transaction amount, in INR. |
| 7 | `balance_after` | numeric | yes |  |  |  |  | Account balance after this transaction, in INR. |
| 8 | `description` | varchar | yes |  |  |  |  | Narration text from the statement. |
| 9 | `category` | varchar | yes |  |  |  |  | What the transaction was classed as, such as salary or EMI. |
| 10 | `counterparty` | varchar | yes |  |  |  |  | Who the money came from or went to. |
| 11 | `is_recurring` | bool | yes |  |  |  |  | True when the transaction repeats regularly. |
| 12 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `bank_statement_analyses` via `analysis_id` (one-to-many, 1 : 0..N; required)
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### obligation_details

One row is one existing loan or monthly obligation of the applicant, from the bureau, bank statement or declaration. These EMIs feed the FOIR check.

Created in `001_schema.sql`; 12 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application this obligation belongs to. |
| 3 | `source` | varchar | no |  |  |  |  | Where the obligation was found; seed data uses BUREAU and BANK_STATEMENT. |
| 4 | `obligation_type` | varchar | no |  |  |  |  | Kind of obligation, such as a home, personal or credit card loan. |
| 5 | `lender_name` | varchar | yes |  |  |  |  | Name of the lender. |
| 6 | `monthly_emi` | numeric | no |  |  |  |  | Monthly EMI paid on this obligation, in INR. |
| 7 | `outstanding_amount` | numeric | yes |  |  |  |  | Amount still owed, in INR. |
| 8 | `remaining_tenure_months` | int2 | yes |  |  |  |  | Months left to repay, in months. |
| 9 | `exclude_from_foir` | bool | no | false |  |  |  | True when this EMI is left out of the FOIR calculation. Defaults to false. |
| 10 | `is_undisclosed` | bool | no | false |  |  |  | True when the customer did not declare this obligation. Defaults to false. |
| 11 | `dpd_current` | int2 | yes |  |  |  |  | Current days past due on this obligation, in days. |
| 12 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

## Employers

### employers

Created in `069_employer_master.sql`; 26 columns; primary key (id); about 26 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `name` | varchar | no |  |  |  |  | Name |
| 3 | `name_key` | text | no |  | UK |  |  | Name key |
| 4 | `aliases` | text[] | no | '{}' |  |  |  | Aliases |
| 5 | `cin` | varchar | yes |  |  |  |  | Cin |
| 6 | `gstin` | varchar | yes |  |  |  |  | Gstin |
| 7 | `employer_type` | varchar | no | 'OTHER' |  |  | GOVERNMENT \| PSU \| LISTED \| MNC \| PUBLIC_LTD \| PRIVATE_LTD \| LLP \| PARTNERSHIP \| PROPRIETORSHIP \| OTHER | Employer type |
| 8 | `category` | bpchar | no | 'C' |  |  | A \| B \| C | Category |
| 9 | `verified` | bool | no | false |  |  |  | Verified |
| 10 | `listed` | bool | yes |  |  |  |  | Listed |
| 11 | `listed_symbol` | varchar | yes |  |  |  |  | Listed symbol |
| 12 | `incorporation_year` | int2 | yes |  |  |  |  | Incorporation year |
| 13 | `incorporated_on` | date | yes |  |  |  |  | Incorporated on |
| 14 | `years_of_filings` | int2 | yes |  |  |  |  | Years of filings |
| 15 | `company_status` | varchar | no | 'UNKNOWN' |  |  | ACTIVE \| STRUCK_OFF \| UNDER_INSOLVENCY \| UNKNOWN | Company status |
| 16 | `email_domains` | text[] | no | '{}' |  |  |  | Email domains |
| 17 | `industry` | varchar | yes |  |  |  |  | Industry |
| 18 | `hq_city` | varchar | yes |  |  |  |  | Hq city |
| 19 | `hq_state` | varchar | yes |  |  |  |  | Hq state |
| 20 | `caution` | bool | no | false |  |  |  | Caution |
| 21 | `caution_reason` | text | yes |  |  |  |  | Caution reason |
| 22 | `last_verified_at` | timestamptz | yes |  |  |  |  | When last verified |
| 23 | `last_verified_by` | uuid | yes |  | FK | users.id |  | Link to users.id |
| 24 | `source` | varchar | no | 'STAFF' |  |  |  | Source |
| 25 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 26 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |

Relationships:
- belongs to `users` via `last_verified_by` (one-to-many, 0..1 : 0..N; optional)
- has `applications` rows via `applications.employer_id` (one-to-many, 0..1 : 0..N)
- has `employer_category_changes` rows via `employer_category_changes.employer_id` (one-to-many, 1 : 0..N)
- has `employer_checks` rows via `employer_checks.employer_id` (one-to-many, 1 : 0..N)

Triggers: `trg_team_journal`.

### employer_checks

Created in `069_employer_master.sql`; 8 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `employer_id` | uuid | no |  | FK | employers.id |  | Link to employers.id |
| 3 | `check_code` | varchar | no |  |  |  | CIN_MCA \| GSTIN \| LISTED \| GOVT_PSU \| CAUTION | Check code |
| 4 | `result` | varchar | no |  |  |  | PASS \| FAIL \| REVIEW \| NOT_APPLICABLE \| INFO | Result |
| 5 | `detail` | jsonb | no | '{}' |  |  |  | Detail |
| 6 | `source` | varchar | no |  |  |  |  | Source |
| 7 | `checked_by` | uuid | yes |  |  |  |  | Checked by |
| 8 | `checked_at` | timestamptz | no | now() |  |  |  | When checked |

Relationships:
- belongs to `employers` via `employer_id` (one-to-many, 1 : 0..N; required)

### employer_category_changes

Created in `069_employer_master.sql`; 11 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `employer_id` | uuid | no |  | FK | employers.id |  | Link to employers.id |
| 3 | `from_category` | bpchar | no |  |  |  |  | From category |
| 4 | `to_category` | bpchar | no |  |  |  | A \| B \| C | To category |
| 5 | `reason` | text | no |  |  |  |  | Reason |
| 6 | `status` | varchar | no | 'PENDING' |  |  | PENDING \| APPROVED \| REJECTED \| WITHDRAWN | Status |
| 7 | `requested_by` | uuid | yes |  |  |  |  | Requested by |
| 8 | `requested_at` | timestamptz | no | now() |  |  |  | When requested |
| 9 | `decided_by` | uuid | yes |  |  |  |  | Decided by |
| 10 | `decided_at` | timestamptz | yes |  |  |  |  | When decided |
| 11 | `decision_note` | text | yes |  |  |  |  | Decision note |

Relationships:
- belongs to `employers` via `employer_id` (one-to-many, 1 : 0..N; required)

### employer_reference_list

Created in `069_employer_master.sql`; 7 columns; primary key (list_code, name_key).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `list_code` | varchar | no |  | PK |  | GOVT_PSU \| LISTED | List code |
| 2 | `name` | varchar | no |  |  |  |  | Name |
| 3 | `name_key` | text | no |  | PK |  |  | Name key |
| 4 | `exchange` | varchar | yes |  |  |  |  | Exchange |
| 5 | `symbol` | varchar | yes |  |  |  |  | Symbol |
| 6 | `source` | text | no |  |  |  |  | Source |
| 7 | `added_at` | timestamptz | no | now() |  |  |  | When added |

### employer_master_settings

Created in `069_employer_master.sql`; 2 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | bool | no | true | PK |  |  | Internal key |
| 2 | `provider` | varchar | no | 'SIMULATED' |  |  | SIMULATED \| MCA_LIVE | Provider |

### employer_category_pricing

Created in `011_employer_category_pricing.sql`; 13 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `category_code` | varchar | no |  |  |  | A \| B \| C | Category code |
| 3 | `category_label` | varchar | no |  |  |  |  | Category label |
| 4 | `description` | varchar | no |  |  |  |  | Description |
| 5 | `rate_loading_pct` | numeric | no | 0.00 |  |  |  | Rate loading pct |
| 6 | `max_ltv_pct` | numeric | no |  |  |  |  | Max ltv pct |
| 7 | `max_tenure_months` | int2 | no |  |  |  |  | Max tenure months |
| 8 | `processing_fee_inr` | int4 | no |  |  |  |  | Processing fee inr |
| 9 | `display_order` | int2 | no |  |  |  |  | Display order |
| 10 | `policy_version` | varchar | no |  |  |  |  | Policy version |
| 11 | `is_active` | bool | no | true |  |  |  | Yes/no: active |
| 12 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 13 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |

Unique together: (category_code, policy_version); (category_code, policy_version).

Triggers: `trg_employer_category_pricing_updated_at`.

## Policy rules and decisions

### policy_rules

One row per credit rule the SQL engine checks, such as minimum age or minimum CIBIL score. It cannot be edited directly through the API; changes come through an approved policy version and are applied when that version goes live.

Created in `001_schema.sql`; 16 columns; primary key (id); about 16 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `rule_id` | varchar | no |  | UK |  |  | Unique short code for the rule, e.g. HF-AGE-MIN or BUR-SCORE-MIN. |
| 3 | `rule_name` | varchar | no |  |  |  |  | Plain name of the rule shown on screens, e.g. Minimum CIBIL score. |
| 4 | `category` | varchar | no |  |  |  |  | Rule group. Seeded values: HARD_FILTER, BUREAU, INCOME, COLLATERAL, ELIGIBILITY, BANK_STATEMENT. |
| 5 | `parameter` | varchar | no |  |  |  |  | The application fact the rule checks, e.g. cibil_score or age_at_maturity. |
| 6 | `operator` | varchar | no |  |  |  |  | How the fact is compared with the limit. Seeded values: GTE (at least), LTE (at most), EQ (equals). |
| 7 | `threshold_value` | varchar | no |  |  |  |  | The limit, stored as text, e.g. 650 or 21. Changed only through an approved policy version. |
| 8 | `threshold_unit` | varchar | yes |  |  |  |  | Unit of the limit. Seeded values: YEARS, COUNT, PERCENT. Can be blank. |
| 9 | `severity_on_fail` | varchar | no |  |  |  |  | What happens if the rule fails: REJECT (decline) or MAYBE (refer to an officer). |
| 10 | `reason_code` | varchar | yes |  | FK | reason_codes.code |  | Reason code recorded when the rule fails; must exist in reason_codes. |
| 11 | `policy_version` | varchar | no |  |  |  |  | Label of the policy version the rule last came from, e.g. 2026.08; updated when a version's rule changes go live. |
| 12 | `is_active` | bool | no | true |  |  |  | Whether the engine checks this rule. Only active rules are used and captured in rule-set snapshots. |
| 13 | `display_order` | int2 | yes |  |  |  |  | Order the rule appears in on screens. |
| 14 | `description` | text | yes |  |  |  |  | Plain explanation of the rule; also copied into the failure reason when the rule fails. |
| 15 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 16 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed (set automatically) |

Relationships:
- belongs to `reason_codes` via `reason_code` (one-to-many, 0..1 : 0..N; optional)
- has `policy_results` rows via `policy_results.rule_id` (one-to-many, 1 : 0..N)

Triggers: `trg_policy_rules_updated_at`.

### policy_results

One row per rule checked for one application in one engine run, showing whether it passed or failed and why. Written only by the policy engine function.

Created in `001_schema.sql`; 12 columns; primary key (id); about 29,200 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application that was checked. |
| 3 | `rule_id` | varchar | no |  | FK | policy_rules.rule_id |  | The rule that was checked; links to policy_rules. |
| 4 | `policy_version` | varchar | no |  |  |  |  | Label of the rules version used for this check, e.g. 2026.08. |
| 5 | `result` | varchar | no |  |  |  |  | Outcome written by the engine: PASS, FAIL or SKIPPED. |
| 6 | `actual_value` | numeric | yes |  |  |  |  | The applicant's value the engine compared, e.g. the CIBIL score or FOIR %. |
| 7 | `threshold_value` | numeric | yes |  |  |  |  | The limit the value was compared against, as a number. |
| 8 | `severity` | varchar | yes |  |  |  |  | Filled only on FAIL: REJECT or MAYBE, copied from the rule. |
| 9 | `reason` | text | yes |  |  |  |  | Filled only on FAIL: the rule's plain description of what was not met. |
| 10 | `reason_code` | varchar | yes |  | FK | reason_codes.code |  | Filled only on FAIL: the rule's reason code; links to reason_codes. |
| 11 | `evaluated_at` | timestamptz | no | now() |  |  |  | When the rule was checked. |
| 12 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `reason_codes` via `reason_code` (one-to-many, 0..1 : 0..N; optional)
- belongs to `policy_rules` via `rule_id` (one-to-many, 1 : 0..N; required)

### policy_versions

One row per version of the credit policy for a product: a full snapshot of rules and settings that is drafted, approved by someone other than its author, and goes live on its start date. Rows are never deleted, and fields freeze once a version is submitted.

Created in `016_versioned_policy.sql`; 18 columns; primary key (id); about 2 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `tenant_id` | uuid | no | fn_default_tenant_id() | FK | tenants.id |  | The lender this version belongs to; defaults to the demo tenant. |
| 3 | `product` | varchar | no | 'CAR_NEW' |  |  |  | Loan product the version covers; defaults to CAR_NEW (new car loans). |
| 4 | `version_code` | varchar | no |  |  |  |  | Version label, e.g. 2026.08; unique per tenant and product. |
| 5 | `status` | varchar | no | 'DRAFT' |  |  | DRAFT \| PENDING_APPROVAL \| APPROVED \| ACTIVE \| SUPERSEDED \| REJECTED \| CANCELLED | Stage: DRAFT \| PENDING_APPROVAL \| APPROVED \| ACTIVE \| SUPERSEDED \| REJECTED \| CANCELLED. New rows start as DRAFT; only one ACTIVE per product. |
| 6 | `tier` | varchar | yes |  |  |  |  | Size of the change: MATERIAL \| STANDARD \| COSMETIC. Can be blank. |
| 7 | `base_version_id` | uuid | yes |  | FK | policy_versions.id |  | The earlier version this draft was built from; used for before-and-after comparisons. |
| 8 | `is_baseline` | bool | no | false |  |  |  | True for the starting version that existed before approvals were required; it may go live without a recorded approver. |
| 9 | `rationale` | text | no |  |  |  |  | Required written reason for the change. |
| 10 | `regulatory_ref` | varchar | yes |  |  |  |  | Optional reference to the regulation or circular behind the change. |
| 11 | `authored_by` | uuid | yes |  | FK | users.id |  | Staff user who drafted the version. |
| 12 | `submitted_at` | timestamptz | yes |  |  |  |  | When the draft was sent for approval. |
| 13 | `approved_by` | uuid | yes |  | FK | users.id |  | Staff user who approved it; can never be the author. Required once approved or live, except the baseline. |
| 14 | `approved_at` | timestamptz | yes |  |  |  |  | When it was approved; cannot change once recorded. |
| 15 | `effective_from` | timestamptz | yes |  |  |  |  | When the version comes into force; required once approved. Cannot change after it goes live. |
| 16 | `effective_to` | timestamptz | yes |  |  |  |  | When the version stopped applying; set only when it is superseded. Live windows never overlap. |
| 17 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 18 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed (set automatically) |

Unique together: (tenant_id, product, version_code); (tenant_id, product, version_code).

Relationships:
- belongs to `users` via `approved_by` (one-to-many, 0..1 : 0..N; optional)
- belongs to `users` via `authored_by` (one-to-many, 0..1 : 0..N; optional)
- belongs to `policy_versions` via `base_version_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `tenants` via `tenant_id` (one-to-many, 1 : 0..N; required)
- has `credit_decisions` rows via `credit_decisions.policy_version_id` (one-to-many, 0..1 : 0..N)
- has `engine_decisions` rows via `engine_decisions.policy_version_id` (one-to-many, 0..1 : 0..N)
- has `policy_change_requests` rows via `policy_change_requests.policy_version_id` (one-to-many, 1 : 0..N)
- has `policy_documents` rows via `policy_documents.policy_version_id` (one-to-one, 1 : 0..1)
- has `policy_parameters` rows via `policy_parameters.policy_version_id` (one-to-many, 1 : 0..N)
- has `policy_simulations` rows via `policy_simulations.compared_to_id` (one-to-many, 0..1 : 0..N)
- has `policy_simulations` rows via `policy_simulations.policy_version_id` (one-to-many, 1 : 0..N)
- has `policy_version_events` rows via `policy_version_events.policy_version_id` (one-to-many, 1 : 0..N)
- has `policy_version_rule_changes` rows via `policy_version_rule_changes.policy_version_id` (one-to-many, 1 : 0..N)
- has `policy_versions` rows via `policy_versions.base_version_id` (one-to-many, 0..1 : 0..N)
- has `recommendations` rows via `recommendations.policy_version_id` (one-to-many, 0..1 : 0..N)

Triggers: `trg_policy_version_apply_rules`, `trg_policy_version_events`, `trg_policy_versions_guard`, `trg_policy_versions_updated_at`, `trg_practice_policy_stays_draft`.

### policy_documents

The rules document (a GoRules Zen decision model) for one policy version, one per version. Editable only while the version is a draft.

Created in `016_versioned_policy.sql`; 6 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `policy_version_id` | uuid | no |  | FK, UK | policy_versions.id |  | The policy version this document belongs to; one document per version. |
| 3 | `engine` | varchar | no | 'zen' |  |  |  | Rules engine format. Allowed: zen (GoRules Zen). |
| 4 | `document` | jsonb | no |  |  |  |  | The full rules decision model as JSON. |
| 5 | `document_sha256` | varchar | no |  |  |  |  | Fingerprint of the document, recalculated by the database on every save so any change is detectable. |
| 6 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `policy_versions` via `policy_version_id` (one-to-one, 1 : 0..1; required)

Triggers: `trg_policy_documents_guard`.

### policy_parameters

One setting value (rate, cap, charge) for one policy version. Editable only while the version is a draft, and each value must fit its definition in parameter_definitions.

Created in `016_versioned_policy.sql`; 4 columns; primary key (policy_version_id, param_key); about 66 rows on 23 Oct 2026; link table between parameter_definitions and policy_versions.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `policy_version_id` | uuid | no |  | PK, FK | policy_versions.id |  | The policy version this value belongs to. |
| 2 | `param_key` | varchar | no |  | PK, FK | parameter_definitions.param_key |  | Which setting this is, e.g. pricing.base_rate.approve; links to parameter_definitions. |
| 3 | `value` | jsonb | no |  |  |  |  | The setting's value as JSON. Must match the defined type, stay within min and max, and be an allowed value if a list exists. |
| 4 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `parameter_definitions` via `param_key` (one-to-many, 1 : 0..N; required)
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_policy_parameters_guard`, `trg_policy_parameters_validate`.

### parameter_definitions

One row per policy setting describing what it is, its type, unit and limits, and who owns and approves it. It is reference data, read-only through the API.

Created in `016_versioned_policy.sql`; 15 columns; primary key (param_key).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `param_key` | varchar | no |  | PK |  |  | Setting key in dotted lowercase form, e.g. bureau.band_min.approve. Must contain at least one dot. |
| 2 | `section` | varchar | no |  |  |  |  | Group the setting belongs to, e.g. bureau or pricing. |
| 3 | `label` | varchar | no |  |  |  |  | Plain name shown on screens, e.g. Base rate — Approve band. |
| 4 | `value_type` | varchar | no |  |  |  | number \| percent \| amount_inr \| months \| score \| boolean \| text \| list | Kind of value: number \| percent \| amount_inr \| months \| score \| boolean \| text \| list. |
| 5 | `unit` | varchar | yes |  |  |  |  | Unit shown with the value, e.g. % p.a. or score. |
| 6 | `min_value` | numeric | yes |  |  |  |  | Lowest value allowed for number-type settings; checked when a value is saved. |
| 7 | `max_value` | numeric | yes |  |  |  |  | Highest value allowed for number-type settings; checked when a value is saved. |
| 8 | `allowed_values` | jsonb | yes |  |  |  |  | Optional JSON list of the only values allowed; checked when a value is saved. |
| 9 | `owner_role` | varchar | no | 'policy_manager' |  |  |  | Role that owns the setting; defaults to policy_manager. |
| 10 | `approver_role` | varchar | no | 'credit_head' |  |  |  | Role that approves changes to it; defaults to credit_head. |
| 11 | `is_locked` | bool | no | false |  |  |  | Marks the setting as locked. |
| 12 | `regulatory_ref` | varchar | yes |  |  |  |  | Optional reference to the regulation behind the setting. |
| 13 | `description` | varchar | yes |  |  |  |  | Plain explanation of the setting. |
| 14 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 15 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed (set automatically) |

Relationships:
- has `policy_parameters` rows via `policy_parameters.param_key` (one-to-many, 1 : 0..N)

Triggers: `trg_parameter_definitions_updated_at`.

### policy_change_requests

One row each time a draft policy version is sent for approval, holding the title and summary the author wrote. Created through the submit function.

Created in `016_versioned_policy.sql`; 7 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `tenant_id` | uuid | no | fn_default_tenant_id() |  |  |  | The lender this request belongs to; defaults to the demo tenant. |
| 3 | `policy_version_id` | uuid | no |  | FK | policy_versions.id |  | The policy version being proposed. |
| 4 | `title` | varchar | no |  |  |  |  | Short title of the change, up to 200 characters. |
| 5 | `summary` | text | yes |  |  |  |  | Longer description of what changes and why. |
| 6 | `requested_by` | uuid | yes |  | FK | users.id |  | Staff user who sent the change for approval. |
| 7 | `created_at` | timestamptz | no | now() |  |  |  | When the request was made |

Relationships:
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 1 : 0..N; required)
- belongs to `users` via `requested_by` (one-to-many, 0..1 : 0..N; optional)
- has `policy_change_reviews` rows via `policy_change_reviews.change_request_id` (one-to-many, 1 : 0..N)

### policy_change_reviews

One row per reviewer's verdict on a change request. The database blocks the version's author from reviewing their own change.

Created in `016_versioned_policy.sql`; 6 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `change_request_id` | uuid | no |  | FK | policy_change_requests.id |  | The change request being reviewed. |
| 3 | `reviewer_id` | uuid | no |  | FK | users.id |  | Staff user who reviewed it; can never be the author of the version. |
| 4 | `decision` | varchar | no |  |  |  | APPROVE \| REJECT \| RETURN | Reviewer's verdict: APPROVE \| REJECT \| RETURN. |
| 5 | `comment` | text | yes |  |  |  |  | Reviewer's note explaining the verdict. |
| 6 | `reviewed_at` | timestamptz | no | now() |  |  |  | When the review was given. |

Relationships:
- belongs to `policy_change_requests` via `change_request_id` (one-to-many, 1 : 0..N; required)
- belongs to `users` via `reviewer_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_policy_change_reviews_four_eyes`.

### policy_simulations

One row per impact check: a draft policy version run against a sample of past applications and compared with another version, to show which decisions would change. Shown on the approval screen.

Created in `016_versioned_policy.sql`; 8 columns; primary key (id); about 1 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `policy_version_id` | uuid | no |  | FK | policy_versions.id |  | The policy version that was tested. |
| 3 | `compared_to_id` | uuid | yes |  | FK | policy_versions.id |  | The policy version it was compared against. |
| 4 | `sample_size` | int4 | no |  |  |  |  | Number of past applications used in the check. |
| 5 | `flips` | jsonb | no | '{}' |  |  |  | JSON of applications whose decision would change between the two versions. |
| 6 | `summary` | jsonb | no | '{}' |  |  |  | JSON summary of the check's results. |
| 7 | `run_by` | uuid | yes |  |  |  |  | Staff user who ran the check. |
| 8 | `run_at` | timestamptz | no | now() |  |  |  | When the check was run. |

Relationships:
- belongs to `policy_versions` via `compared_to_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 1 : 0..N; required)

### policy_version_events

Append-only history of every status change on a policy version, written by the database itself so it cannot be skipped. No one can insert, edit or delete rows directly.

Created in `032_policy_change_history.sql`; 8 columns; primary key (id); about 3 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `policy_version_id` | uuid | no |  | FK | policy_versions.id |  | The policy version whose status changed. |
| 3 | `from_status` | varchar | yes |  |  |  |  | Status before the change; blank for the first event when the version was drafted. |
| 4 | `to_status` | varchar | no |  |  |  |  | Status after the change, e.g. PENDING_APPROVAL or ACTIVE. |
| 5 | `actor_id` | uuid | yes |  | FK | users.id |  | Signed-in staff user who made the change; blank for the scheduled activation job or the SQL editor. |
| 6 | `reconstructed` | bool | no | false |  |  |  | True for history rebuilt later from the version's dates, not recorded at the time. |
| 7 | `at` | timestamptz | no | now() |  |  |  | When the status changed. |
| 8 | `seq` | int8 | no |  |  |  |  | Running counter that keeps events in true order when two happen at the same instant. |

Relationships:
- belongs to `users` via `actor_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 1 : 0..N; required)

### policy_version_rule_changes

One row per rule a draft policy version changes: switching it on or off, a new limit, or a new action on failure. Applied to policy_rules when the version goes live.

Created in `074_policy_rule_changes.sql`; 7 columns; primary key (policy_version_id, rule_id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `policy_version_id` | uuid | no |  | PK, FK | policy_versions.id |  | The policy version carrying this rule change. |
| 2 | `rule_id` | varchar | no |  | PK |  |  | The rule being changed; one change per rule per version. |
| 3 | `is_active` | bool | yes |  |  |  |  | New on/off setting for the rule; blank means no change. |
| 4 | `threshold_value` | varchar | yes |  |  |  |  | New limit for the rule, as text; blank means no change. Must be a number if the current limit is. |
| 5 | `severity_on_fail` | varchar | yes |  |  |  |  | New action on failure: REJECT \| MAYBE. Blank means no change. At least one of the three change fields must be filled. |
| 6 | `before` | jsonb | no |  |  |  |  | JSON copy of the rule as it was: on/off, limit and action on failure. |
| 7 | `changed_at` | timestamptz | no | now() |  |  |  | When the change was last edited on the draft. |

Relationships:
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 1 : 0..N; required)

### policy_rule_history

Append-only record of each rule change actually applied to policy_rules when a policy version went live, with the rule before and after. Written only by the database.

Created in `074_policy_rule_changes.sql`; 6 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `rule_id` | varchar | no |  |  |  |  | The rule that was changed. |
| 3 | `policy_version_id` | uuid | no |  |  |  |  | The policy version whose going live applied the change. |
| 4 | `before` | jsonb | no |  |  |  |  | JSON of the rule before: on/off, limit and action on failure. |
| 5 | `after` | jsonb | no |  |  |  |  | JSON of the rule after: on/off, limit and action on failure. |
| 6 | `applied_at` | timestamptz | no | now() |  |  |  | When the change was applied. |

### rule_set_snapshots

A stored copy of an exact set of active rules, kept once per unique fingerprint, so any past decision can be replayed with the rules it used. Written only by the database.

Created in `030_decision_version_pinning.sql`; 3 columns; primary key (rules_sha256).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `rules_sha256` | varchar | no |  | PK |  |  | Fingerprint of the rule set; decisions point to it. Only outcome-changing rule fields count, not wording. |
| 2 | `rules` | jsonb | no |  |  |  |  | JSON list of the active rules at that time: rule, fact, operator, limit, unit, action on failure, reason code, version. |
| 3 | `first_seen_at` | timestamptz | no | now() |  |  |  | When this exact rule set was first captured. |

Relationships:
- has `credit_decisions` rows via `credit_decisions.rules_snapshot` (one-to-many, 0..1 : 0..N)
- has `recommendations` rows via `recommendations.rules_snapshot` (one-to-many, 0..1 : 0..N)

### reason_codes

Lookup list of reasons a case can be declined or referred, with the message for the customer and the note for staff. Reference data, read-only through the API.

Created in `001_schema.sql`; 8 columns; primary key (code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `code` | varchar | no |  | PK |  |  | Unique reason code, e.g. CIBIL_LOW or DPD_12M. |
| 2 | `category` | varchar | no |  |  |  |  | Reason group. Seeded values: BUREAU, BANK_STATEMENT, COLLATERAL, DOCUMENT, ELIGIBILITY, FRAUD, INCOME, KYC. |
| 3 | `severity` | varchar | no |  |  |  |  | Effect of the reason. Seeded values: REJECT or MAYBE (refer to an officer). |
| 4 | `customer_message` | text | no |  |  |  |  | Wording shown to the customer. |
| 5 | `internal_message` | text | no |  |  |  |  | Wording for staff, with the rule detail, e.g. CIBIL score below 650 — auto reject. |
| 6 | `is_active` | bool | no | true |  |  |  | Whether the reason code is in use. |
| 7 | `display_order` | int2 | yes |  |  |  |  | Order the reason appears in on screens. |
| 8 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- has `policy_results` rows via `policy_results.reason_code` (one-to-many, 0..1 : 0..N)
- has `policy_rules` rows via `policy_rules.reason_code` (one-to-many, 0..1 : 0..N)

### recommendations

The system's recommendation for one application from one assessment: verdict, suggested loan terms, ratios and pricing. Each row is stamped by the database with the policy, rule set and model in force at that moment.

Created in `001_schema.sql`; 31 columns; primary key (id); about 1,817 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application this recommendation is for. |
| 3 | `recommendation` | varchar | no |  |  |  |  | Verdict: APPROVE, MAYBE (refer to an officer) or REJECT. The rules engine can overwrite it when the server_engine switch is on. |
| 4 | `recommended_rate` | numeric | yes |  |  |  |  | Suggested interest rate, % p.a., including any employer-category loading. |
| 5 | `recommended_rate_type` | varchar | yes |  |  |  |  | Rate type from the rate grid; defaults to FIXED. |
| 6 | `recommended_amount` | numeric | yes |  |  |  |  | Suggested loan amount, INR. |
| 7 | `recommended_tenure` | int2 | yes |  |  |  |  | Suggested loan length, months; capped at the employer category's tenure cap when that is tighter. |
| 8 | `recommended_emi` | numeric | yes |  |  |  |  | Suggested monthly instalment, INR. |
| 9 | `ltv_calculated` | numeric | yes |  |  |  |  | Loan-to-value worked out for the case, %. |
| 10 | `foir_calculated` | numeric | yes |  |  |  |  | Fixed obligations to income ratio worked out for the case, %. |
| 11 | `dbr_calculated` | numeric | yes |  |  |  |  | Debt burden ratio worked out for the case, %. |
| 12 | `net_surplus` | numeric | yes |  |  |  |  | Income left after obligations and the new EMI, INR. |
| 13 | `risk_factors` | jsonb | yes |  |  |  |  | JSON list of rule results and other points counting against the case. |
| 14 | `positive_factors` | jsonb | yes |  |  |  |  | JSON list of points counting in the case's favour. |
| 15 | `rules_passed` | int2 | yes |  |  |  |  | Number of rules passed. |
| 16 | `rules_failed` | int2 | yes |  |  |  |  | Number of rules failed whose action is REJECT. |
| 17 | `rules_flagged` | int2 | yes |  |  |  |  | Number of rules failed whose action is MAYBE (refer to an officer). |
| 18 | `summary_text` | text | yes |  |  |  |  | Plain-language summary of the recommendation; the rules engine appends a note when it decides. |
| 19 | `generated_at` | timestamptz | no | now() |  |  |  | When the recommendation was produced or last re-decided. |
| 20 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 21 | `policy_version_id` | uuid | yes |  | FK | policy_versions.id |  | Approved policy version in force at decision time; set by the database, never by the caller. |
| 22 | `rules_snapshot` | varchar | yes |  | FK | rule_set_snapshots.rules_sha256 |  | Fingerprint of the exact rule set used; links to rule_set_snapshots. Empty for old rows. Set by the database. |
| 23 | `model_version` | varchar | yes |  | FK | model_versions.model_version |  | Risk model approved for use at decision time, e.g. cercit-risk-v1. Set by the database. |
| 24 | `version_basis` | varchar | yes |  |  |  | RECORDED \| ASSUMED | RECORDED \| ASSUMED. RECORDED when stamped at decision time; ASSUMED for rows that existed before stamping began. |
| 25 | `employer_category` | bpchar | yes |  |  |  |  | Employer category used for pricing: A, B or C. |
| 26 | `employer_category_basis` | varchar | yes |  |  |  |  | How the category was set: MASTER_VERIFIED, MASTER_PROVISIONAL (from the Employer Master) or DECLARED_TYPE (from the employer type the customer gave). |
| 27 | `base_rate_pct` | numeric | yes |  |  |  |  | Base interest rate for the bureau score band, % p.a., before the category loading. |
| 28 | `rate_loading_pct` | numeric | yes |  |  |  |  | Extra rate added for the employer category, % p.a. |
| 29 | `processing_fee_inr` | int4 | yes |  |  |  |  | Processing fee for the employer category, INR. |
| 30 | `category_ltv_cap_pct` | numeric | yes |  |  |  |  | Employer category's LTV cap, %. A case above it is referred to an officer. |
| 31 | `category_tenure_cap` | int2 | yes |  |  |  |  | Employer category's longest allowed tenure, months. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `model_versions` via `model_version` (one-to-many, 0..1 : 0..N; optional)
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `rule_set_snapshots` via `rules_snapshot` (one-to-many, 0..1 : 0..N; optional)
- has `credit_decisions` rows via `credit_decisions.recommendation_id` (one-to-many, 1 : 0..N)

Triggers: `trg_recommendations_version_stamp`.

### engine_decisions

Every answer the rules engine on AWS gives for an application, with the policy version used and the rules that failed. Written only by the engine; when the server_engine switch is on, the answer also sets the application's decision.

Created in `033_server_engine_decisions.sql`; 11 columns; primary key (id); about 8 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application the engine decided. |
| 3 | `policy_version_id` | uuid | yes |  | FK | policy_versions.id |  | The policy version the engine ran. |
| 4 | `version_code` | varchar | yes |  |  |  |  | Label of that policy version, e.g. 2026.08. |
| 5 | `decision` | varchar | no |  |  |  | approve \| review \| decline | Engine's answer: approve \| review \| decline. |
| 6 | `score` | int2 | yes |  |  |  |  | Score the engine returned with its answer. |
| 7 | `hard_failed` | text[] | no | '{}' |  |  |  | List of rules failed that lead to decline. |
| 8 | `soft_failed` | text[] | no | '{}' |  |  |  | List of rules failed that lead to referral. |
| 9 | `facts_not_known` | text[] | no | '{}' |  |  |  | List of facts the engine needed but did not have for this application. |
| 10 | `applied` | bool | no | false |  |  |  | True when the switch was on and the answer was copied to the case: approve to APPROVE, review to MAYBE, decline to REJECT. |
| 11 | `decided_at` | timestamptz | no | now() |  |  |  | When the engine gave the answer. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 0..1 : 0..N; optional)

### credit_decisions

The decision on an application, first made by the system and possibly re-made by an officer, with the sanctioned terms. Each row is stamped by the database with the policy, rule set and model in force at that moment.

Created in `001_schema.sql`; 20 columns; primary key (id); about 1,817 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application decided. |
| 3 | `recommendation_id` | uuid | no |  | FK | recommendations.id |  | The recommendation this decision was based on. |
| 4 | `decision` | varchar | no |  |  |  |  | Verdict, e.g. APPROVE, MAYBE or REJECT. |
| 5 | `decided_by` | varchar | no |  |  |  |  | Who made the decision: SYSTEM or OFFICER. |
| 6 | `officer_id` | uuid | yes |  | FK | users.id |  | Staff user who decided, when an officer made the decision. |
| 7 | `sanctioned_amount` | numeric | yes |  |  |  |  | Loan amount sanctioned, INR. |
| 8 | `sanctioned_rate` | numeric | yes |  |  |  |  | Interest rate sanctioned, % p.a. |
| 9 | `sanctioned_tenure` | int2 | yes |  |  |  |  | Loan length sanctioned, months. |
| 10 | `sanctioned_emi` | numeric | yes |  |  |  |  | Monthly instalment sanctioned, INR. |
| 11 | `reason_codes` | varchar[] | yes |  |  |  |  | List of reason codes behind the decision. |
| 12 | `officer_remarks` | text | yes |  |  |  |  | Officer's notes on the decision. |
| 13 | `decision_letter_path` | text | yes |  |  |  |  | File location of the decision letter. |
| 14 | `sanction_valid_until` | date | yes |  |  |  |  | Date the sanction expires. |
| 15 | `decided_at` | timestamptz | no | now() |  |  |  | When the decision was made or last re-made. |
| 16 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 17 | `policy_version_id` | uuid | yes |  | FK | policy_versions.id |  | Approved policy version in force at decision time; set by the database, never by the caller. |
| 18 | `rules_snapshot` | varchar | yes |  | FK | rule_set_snapshots.rules_sha256 |  | Fingerprint of the exact rule set used; links to rule_set_snapshots. Empty for old rows. Set by the database. |
| 19 | `model_version` | varchar | yes |  | FK | model_versions.model_version |  | Risk model approved for use at decision time. Set by the database. |
| 20 | `version_basis` | varchar | yes |  |  |  | RECORDED \| ASSUMED | RECORDED \| ASSUMED. RECORDED when stamped at decision time; ASSUMED for rows that existed before stamping began. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `model_versions` via `model_version` (one-to-many, 0..1 : 0..N; optional)
- belongs to `users` via `officer_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `policy_versions` via `policy_version_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `recommendations` via `recommendation_id` (one-to-many, 1 : 0..N; required)
- belongs to `rule_set_snapshots` via `rules_snapshot` (one-to-many, 0..1 : 0..N; optional)
- has `override_logs` rows via `override_logs.decision_id` (one-to-many, 1 : 0..N)

Triggers: `trg_credit_decisions_officer_limits`, `trg_credit_decisions_version_stamp`, `trg_practice_synthetic_only`.

### override_logs

One row each time an officer's decision differs from the system's recommendation, recording what changed and why. Written by the officer decision function.

Created in `001_schema.sql`; 10 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application where the override happened. |
| 3 | `decision_id` | uuid | no |  | FK | credit_decisions.id |  | The credit decision that was overridden. |
| 4 | `officer_id` | uuid | no |  | FK | users.id |  | Staff user who made the override. |
| 5 | `override_type` | varchar | no |  |  |  |  | Kind of override; the functions write DECISION_OVERRIDE. |
| 6 | `original_value` | text | no |  |  |  |  | The system's verdict before the override, or UNKNOWN. |
| 7 | `new_value` | text | no |  |  |  |  | The officer's verdict, e.g. APPROVE or REJECT. |
| 8 | `reason` | text | no |  |  |  |  | Officer's reason for overriding; falls back to their remarks or 'Officer override'. |
| 9 | `approved_by_id` | uuid | yes |  | FK | users.id |  | Staff user who approved the override, if one did. |
| 10 | `created_at` | timestamptz | no | now() |  |  |  | When the override was logged |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `users` via `approved_by_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `credit_decisions` via `decision_id` (one-to-many, 1 : 0..N; required)
- belongs to `users` via `officer_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_practice_synthetic_only`.

### fraud_signals

One row per possible fraud warning raised on an application, with the evidence, the automatic action and the staff review. The migrations do not show what writes these rows.

Created in `001_schema.sql`; 14 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The application the warning is about. |
| 3 | `signal_type` | varchar | no |  |  |  |  | Kind of fraud warning. |
| 4 | `severity` | varchar | no |  |  |  |  | How serious the warning is. |
| 5 | `description` | text | no |  |  |  |  | Plain explanation of the warning. |
| 6 | `evidence` | jsonb | yes |  |  |  |  | JSON of the data that triggered the warning. |
| 7 | `auto_action` | varchar | no |  |  |  |  | Action the system took automatically when the warning was raised. |
| 8 | `reviewed` | bool | no | false |  |  |  | Whether staff have reviewed the warning; starts as false. |
| 9 | `reviewed_by_id` | uuid | yes |  | FK | users.id |  | Staff user who reviewed it. |
| 10 | `review_outcome` | varchar | yes |  |  |  |  | Result of the staff review. |
| 11 | `review_notes` | text | yes |  |  |  |  | Reviewer's notes. |
| 12 | `detected_at` | timestamptz | no | now() |  |  |  | When the warning was raised. |
| 13 | `reviewed_at` | timestamptz | yes |  |  |  |  | When it was reviewed. |
| 14 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `users` via `reviewed_by_id` (one-to-many, 0..1 : 0..N; optional)

## Pricing and rate grid

### rate_grid

One row is one credit score band the pricing engine reads: rate and caps on LTV, FOIR and tenure. When a new car grid version goes live (071) its figures are written here and older rows are switched off, not deleted.

Created in `001_schema.sql`; 14 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `score_band_min` | int2 | no |  |  |  |  | Lowest bureau score in this band. |
| 3 | `score_band_max` | int2 | no |  |  |  |  | Highest bureau score in this band. |
| 4 | `band_label` | varchar | no |  |  |  |  | Name of the band; seeded as APPROVE, MAYBE and REJECT. |
| 5 | `rate_pct` | numeric | no |  |  |  |  | Interest rate for the band, in % per year. |
| 6 | `rate_type` | varchar | no |  |  |  |  | Kind of rate; seeded as STANDARD or RISK_ADJUSTED. |
| 7 | `max_ltv_pct` | numeric | no |  |  |  |  | Highest loan-to-value allowed, in % of the vehicle price. |
| 8 | `max_foir_pct` | numeric | no |  |  |  |  | Highest share of income that can go to EMIs (FOIR), in %. |
| 9 | `max_tenure_months` | int2 | no |  |  |  |  | Longest loan term allowed, in months. |
| 10 | `vehicle_category` | varchar | no |  |  |  |  | Vehicle type the band applies to; seeded as CAR. |
| 11 | `policy_version` | varchar | no |  |  |  |  | Policy version the row belongs to, such as 2026.08. |
| 12 | `is_active` | bool | no | true |  |  |  | True for rows the engine uses now. Older rows are kept, switched off. |
| 13 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 14 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |

Triggers: `trg_rate_grid_updated_at`.

### rate_grid_versions

One row is one version of a product's rate grid as it moves from draft to approval to live. Only one draft or pending version per product at a time; the author can never approve their own grid, and each step goes to the audit log.

Created in `071_rate_grid_versions.sql`; 14 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `product_code` | varchar | no |  | FK | pricing_products.code |  | The pricing product this grid is for. |
| 3 | `version_no` | int4 | no |  |  |  |  | Version number, unique within the product. |
| 4 | `status` | varchar | no | 'DRAFT' |  |  | DRAFT \| PENDING_APPROVAL \| APPROVED \| ACTIVE \| SUPERSEDED \| REJECTED | Stage of the version: DRAFT \| PENDING_APPROVAL \| APPROVED \| ACTIVE \| SUPERSEDED \| REJECTED. Starts as DRAFT. |
| 5 | `rationale` | text | yes |  |  |  |  | The author's reason for the change. |
| 6 | `base_version_id` | uuid | yes |  |  |  |  | The version this draft was copied from, if any. |
| 7 | `authored_by` | uuid | yes |  |  |  |  | Staff member who wrote the draft. |
| 8 | `created_at` | timestamptz | no | now() |  |  |  | When the draft was started |
| 9 | `submitted_at` | timestamptz | yes |  |  |  |  | When the draft was sent for approval. |
| 10 | `approved_by` | uuid | yes |  |  |  |  | Staff member who approved or rejected it; never the author. |
| 11 | `approved_at` | timestamptz | yes |  |  |  |  | When it was approved or rejected. |
| 12 | `decision_note` | text | yes |  |  |  |  | Note left by the approver with the decision. |
| 13 | `effective_from` | timestamptz | yes |  |  |  |  | When the grid starts to apply. |
| 14 | `effective_to` | timestamptz | yes |  |  |  |  | When the grid stopped applying; set when a newer grid replaces it. |

Unique together: (product_code, version_no); (product_code, version_no).

Relationships:
- belongs to `pricing_products` via `product_code` (one-to-many, 1 : 0..N; required)
- has `rate_grid_version_bands` rows via `rate_grid_version_bands.version_id` (one-to-many, 1 : 0..N)
- has `rate_grid_version_categories` rows via `rate_grid_version_categories.version_id` (one-to-many, 1 : 0..N)

### rate_grid_version_bands

One row is one score band inside a rate grid version: rate and caps. When a car grid version goes live these rows are copied into rate_grid.

Created in `071_rate_grid_versions.sql`; 9 columns; primary key (version_id, score_band_min).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `version_id` | uuid | no |  | PK, FK | rate_grid_versions.id |  | The grid version this band belongs to. Deleted with the version. |
| 2 | `band_label` | varchar | no |  |  |  |  | Name of the band, such as APPROVE or MAYBE. |
| 3 | `score_band_min` | int2 | no |  | PK |  |  | Lowest bureau score in this band. With version_id, it forms the key. |
| 4 | `score_band_max` | int2 | no |  |  |  |  | Highest bureau score in this band. |
| 5 | `rate_pct` | numeric | no |  |  |  |  | Interest rate for the band, in % per year. |
| 6 | `rate_type` | varchar | no | 'STANDARD' |  |  |  | Kind of rate, such as STANDARD or RISK_ADJUSTED. Defaults to STANDARD. |
| 7 | `max_ltv_pct` | numeric | no |  |  |  |  | Highest loan-to-value allowed, in % of the vehicle price. |
| 8 | `max_foir_pct` | numeric | no |  |  |  |  | Highest share of income that can go to EMIs (FOIR), in %. |
| 9 | `max_tenure_months` | int2 | no |  |  |  |  | Longest loan term allowed, in months. |

Relationships:
- belongs to `rate_grid_versions` via `version_id` (one-to-many, 1 : 0..N; required)

### rate_grid_version_categories

One row is one employer category inside a rate grid version, with its rate loading, caps and processing fee. When a car grid goes live these are written into employer_category_pricing.

Created in `071_rate_grid_versions.sql`; 8 columns; primary key (version_id, category_code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `version_id` | uuid | no |  | PK, FK | rate_grid_versions.id |  | The grid version this category belongs to. Deleted with the version. |
| 2 | `category_code` | bpchar | no |  | PK |  | A \| B \| C | Employer category letter: A \| B \| C. |
| 3 | `category_label` | varchar | no |  |  |  |  | Display name of the category. |
| 4 | `description` | varchar | no | '' |  |  |  | Plain description of which employers fall in it. Empty by default. |
| 5 | `rate_loading_pct` | numeric | no |  |  |  |  | Extra interest added on top of the band rate, in % points. |
| 6 | `max_ltv_pct` | numeric | no |  |  |  |  | Highest loan-to-value for this category, in % of the vehicle price. |
| 7 | `max_tenure_months` | int2 | no |  |  |  |  | Longest loan term for this category, in months. |
| 8 | `processing_fee_inr` | int4 | no |  |  |  |  | Processing fee charged, in INR. |

Relationships:
- belongs to `rate_grid_versions` via `version_id` (one-to-many, 1 : 0..N; required)

### pricing_products

One row is one product or segment that can have its own rate grid. Only New car, salaried (CAR_NEW_SALARIED) is used by the engine today; others can be added and approved for later.

Created in `071_rate_grid_versions.sql`; 6 columns; primary key (code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `code` | varchar | no |  | PK |  |  | Short product code, capitals, digits and underscores, 3 to 30 characters (enforced), e.g. CAR_NEW_SALARIED. |
| 2 | `name` | varchar | no |  |  |  |  | Display name of the product. |
| 3 | `description` | text | yes |  |  |  |  | What the product covers. |
| 4 | `used_by_engine` | bool | no | false |  |  |  | True when the decision engine prices with this product's grid. Defaults to false. |
| 5 | `created_by` | uuid | yes |  |  |  |  | Staff member who added the product. |
| 6 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- has `rate_grid_versions` rows via `rate_grid_versions.product_code` (one-to-many, 1 : 0..N)

Triggers: `trg_team_journal`.

## Loan after approval

### loan_offers

One row is one version of the loan offer (sanction letter and Key Facts Statement) issued on an approved application. The customer accepts exactly the version they saw, checked by its hash; the KFS is valid 3 working days.

Created in `049_after_approval.sql`; 34 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application the offer is for. |
| 3 | `version` | int2 | no |  |  |  |  | Offer version number, unique within the application. |
| 4 | `status` | varchar | no | 'ISSUED' |  |  | ISSUED \| ACCEPTED \| EXPIRED \| WITHDRAWN | Offer state: ISSUED \| ACCEPTED \| EXPIRED \| WITHDRAWN. Starts as ISSUED. |
| 5 | `sanction_ref` | varchar | no |  |  |  |  | Reference number of the sanction letter. |
| 6 | `kfs_ref` | varchar | no |  |  |  |  | Reference number of the Key Facts Statement. |
| 7 | `sanctioned_amount` | numeric | no |  |  |  |  | Loan amount sanctioned, in INR. |
| 8 | `rate_pct` | numeric | no |  |  |  |  | Interest rate, in % per year. |
| 9 | `rate_type` | varchar | no | 'FIXED' |  |  |  | Kind of rate. Defaults to FIXED. |
| 10 | `tenure_months` | int2 | no |  |  |  |  | Loan term, in months. |
| 11 | `emi` | numeric | no |  |  |  |  | Monthly installment, in INR. |
| 12 | `processing_fee` | numeric | no |  |  |  |  | Processing fee, in INR. |
| 13 | `documentation_charge` | numeric | no |  |  |  |  | Documentation charge, in INR. |
| 14 | `gst_on_fees` | numeric | no |  |  |  |  | GST charged on the fees, in INR. |
| 15 | `stamp_duty` | numeric | no |  |  |  |  | Stamp duty, in INR. |
| 16 | `total_upfront` | numeric | no |  |  |  |  | All upfront charges added together, in INR. |
| 17 | `net_disbursal` | numeric | no |  |  |  |  | Amount actually paid out after upfront charges, in INR. |
| 18 | `apr_pct` | numeric | no |  |  |  |  | Annual percentage rate as the KFS defines it: the rate at which EMIs repay the net amount received, in %. |
| 19 | `total_interest` | numeric | no |  |  |  |  | Total interest over the loan term, in INR. |
| 20 | `total_payable` | numeric | no |  |  |  |  | Total the customer pays over the term, in INR. |
| 21 | `emi_day` | int2 | no | 5 |  |  |  | Day of the month the EMI is due. Defaults to 5. |
| 22 | `indicative_first_emi` | date | no |  |  |  |  | Expected date of the first EMI: the 5th of the next month, at least 15 days after disbursement. |
| 23 | `penal_charge` | numeric | no | 500 |  |  |  | Penal charge for late payment, in INR. Defaults to 500. |
| 24 | `bounce_charge` | numeric | no | 500 |  |  |  | Charge for a bounced EMI, in INR. Defaults to 500. |
| 25 | `foreclosure_pct` | numeric | no | 4 |  |  |  | Foreclosure charge, in % of the amount closed early. Defaults to 4. |
| 26 | `foreclosure_lock_emis` | int2 | no | 6 |  |  |  | Number of EMIs that must be paid before foreclosure is allowed. Defaults to 6. |
| 27 | `cooling_off_days` | int2 | no | 3 |  |  |  | Days the customer can exit the loan without penalty. Defaults to 3. |
| 28 | `dealer_name` | varchar | yes |  |  |  |  | Dealer the vehicle is bought from. |
| 29 | `vehicle` | varchar | yes |  |  |  |  | Vehicle being financed (make, model, variant). |
| 30 | `valid_until` | date | no |  |  |  |  | Last date the offer can be accepted. |
| 31 | `kfs_hash` | varchar | no |  |  |  |  | Fingerprint of the KFS content; acceptance must match it so the customer accepts the version they saw. |
| 32 | `issued_by` | uuid | yes |  |  |  |  | Staff member who issued the offer. |
| 33 | `issued_at` | timestamptz | no | now() |  |  |  | When the offer was issued |
| 34 | `accepted_at` | timestamptz | yes |  |  |  |  | When the customer accepted the offer. |

Unique together: (application_id, version); (application_id, version).

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- has `loan_agreements` rows via `loan_agreements.offer_id` (one-to-many, 1 : 0..N)

### loan_agreements

One row is the loan agreement prepared from an accepted offer, built from a frozen snapshot and e-signed by the customer. The content hash is kept with the signature; the signature is a demo, not Aadhaar eSign.

Created in `049_after_approval.sql`; 14 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application the agreement is for. |
| 3 | `offer_id` | uuid | no |  | FK | loan_offers.id |  | The accepted loan offer the agreement is built from. |
| 4 | `agreement_ref` | varchar | no |  |  |  |  | Reference number of the agreement. |
| 5 | `template_version` | varchar | no |  |  |  |  | Version of the agreement text template used. |
| 6 | `snapshot` | jsonb | no |  |  |  |  | Everything the agreement text is built from, frozen at preparation (JSON). |
| 7 | `content_hash` | varchar | no |  |  |  |  | Fingerprint of the agreement content; signing must match it. |
| 8 | `status` | varchar | no | 'READY' |  |  | READY \| SIGNED \| VOID | Agreement state: READY \| SIGNED \| VOID. Starts as READY. |
| 9 | `signer_name` | varchar | yes |  |  |  |  | Name the customer typed to sign. |
| 10 | `sign_method` | varchar | yes |  |  |  |  | How it was signed; the demo writes EMAIL_CODE_DEMO. |
| 11 | `code_verified_at` | timestamptz | yes |  |  |  |  | When the customer's email code was verified. |
| 12 | `signed_at` | timestamptz | yes |  |  |  |  | When the agreement was signed. |
| 13 | `user_agent` | text | yes |  |  |  |  | Browser details of the device used to sign. |
| 14 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `loan_offers` via `offer_id` (one-to-many, 1 : 0..N; required)

### repayment_mandates

One row is the EMI auto-debit mandate (e-NACH, simulated in the demo) the customer registers for a loan. The account number is stored encrypted, with only the last 4 digits in clear.

Created in `049_after_approval.sql`; 16 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | no |  | FK | applications.id |  | The loan application the mandate is for. |
| 3 | `holder_name` | varchar | no |  |  |  |  | Account holder's name. |
| 4 | `bank_name` | varchar | no |  |  |  |  | Name of the bank. |
| 5 | `ifsc` | varchar | no |  |  |  |  | IFSC code of the branch: 4 letters, a 0, then 6 letters or digits (enforced). |
| 6 | `account_enc` | bytea | no |  |  |  |  | Bank account number, encrypted with the PII key (fn_pii_encrypt). |
| 7 | `account_last4` | varchar | no |  |  |  |  | Last 4 digits of the account number, shown in clear. |
| 8 | `account_type` | varchar | no |  |  |  |  | Account type: SAVINGS or CURRENT. |
| 9 | `max_amount` | numeric | no |  |  |  |  | Most that can be debited at once, in INR: twice the EMI, rounded up to the thousand. |
| 10 | `frequency` | varchar | no | 'MONTHLY' |  |  |  | How often the debit runs. Defaults to MONTHLY. |
| 11 | `start_date` | date | no |  |  |  |  | First date the mandate can be used. |
| 12 | `end_date` | date | no |  |  |  |  | Last date of the mandate: the loan term plus 12 months after the start. |
| 13 | `umrn` | varchar | no |  |  |  |  | Unique Mandate Reference Number; simulated ones start with SIM. |
| 14 | `mode` | varchar | no | 'E_NACH_SIMULATED' |  |  |  | How the mandate was registered. Defaults to E_NACH_SIMULATED. |
| 15 | `status` | varchar | no | 'REGISTERED' |  |  |  | Mandate state: REGISTERED or CANCELLED. Starts as REGISTERED. |
| 16 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)

### loan_accounts

One row is one disbursed loan. It is created when the officer pays the dealer and is the parent of the repayment schedule and payment history. Staff can read it; changes go only through database functions.

Created in `029_loan_repayment_history.sql`; 20 columns; primary key (id); about 628 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `tenant_id` | uuid | no | fn_default_tenant_id() | FK | tenants.id |  | The lender (tenant) the loan belongs to. Defaults to the default tenant. |
| 3 | `loan_account_no` | varchar | no |  |  |  |  | Loan account number, unique within the tenant; new ones look like CL + year-month + 6 digits. |
| 4 | `application_id` | uuid | yes |  | FK | applications.id |  | The loan application the loan came from. |
| 5 | `customer_id` | uuid | no |  | FK | customers.id |  | The borrower. |
| 6 | `disbursed_on` | date | no |  |  |  |  | Date the loan was paid out. |
| 7 | `disbursed_amount` | numeric | no |  |  |  |  | Loan amount disbursed, in INR. |
| 8 | `installment_day` | int2 | no | 5 |  |  |  | Day of the month the EMI is due, 1 to 28. Defaults to 5. |
| 9 | `emi_amount` | numeric | no |  |  |  |  | Monthly installment, in INR. |
| 10 | `tenure_months` | int2 | no |  |  |  |  | Loan term, in months. |
| 11 | `contract_rate_pct` | numeric | yes |  |  |  |  | Interest rate agreed in the contract, in % per year. |
| 12 | `status` | varchar | no | 'LIVE' |  |  | LIVE \| CLOSED \| FORECLOSED \| WRITTEN_OFF | Loan state: LIVE \| CLOSED \| FORECLOSED \| WRITTEN_OFF. Starts as LIVE. |
| 13 | `closed_on` | date | yes |  |  |  |  | Date the loan was closed. |
| 14 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 15 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |
| 16 | `offer_id` | uuid | yes |  |  |  |  | The loan offer the loan was disbursed against. Added in 049. |
| 17 | `first_emi_date` | date | yes |  |  |  |  | Date of the first EMI. Added in 049. |
| 18 | `paid_to` | varchar | yes |  |  |  |  | Who the money was paid to, usually the dealer. Added in 049. |
| 19 | `payment_ref` | varchar | yes |  |  |  |  | Payment reference of the disbursement; simulated ones start with SIMNEFT. Added in 049. |
| 20 | `net_paid` | numeric | yes |  |  |  |  | Amount actually paid out after upfront charges, in INR. Added in 049. |

Unique together: (tenant_id, loan_account_no); (tenant_id, loan_account_no).

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)
- belongs to `tenants` via `tenant_id` (one-to-many, 1 : 0..N; required)
- has `loan_installments` rows via `loan_installments.loan_id` (one-to-many, 1 : 0..N)
- has `loan_repayments` rows via `loan_repayments.loan_id` (one-to-many, 1 : 0..N)
- has `loan_status_snapshot` rows via `loan_status_snapshot.loan_id` (one-to-many, 1 : 0..N)
- has `loan_status_stale` rows via `loan_status_stale.loan_id` (one-to-one, 1 : 0..1)

### loan_installments

One row is one scheduled EMI of a loan: its number, due date and amount split into principal and interest. The schedule is written when the loan is disbursed.

Created in `029_loan_repayment_history.sql`; 8 columns; primary key (id); about 41,736 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `loan_id` | uuid | no |  | FK | loan_accounts.id |  | The loan this installment belongs to. |
| 3 | `installment_no` | int2 | no |  |  |  |  | Position in the schedule (1, 2, 3...), unique within the loan. |
| 4 | `due_date` | date | no |  |  |  |  | Date the installment is due. |
| 5 | `amount_due` | numeric | no |  |  |  |  | Amount due for the installment, in INR. |
| 6 | `principal_due` | numeric | yes |  |  |  |  | Principal part of the installment, in INR. |
| 7 | `interest_due` | numeric | yes |  |  |  |  | Interest part of the installment, in INR. |
| 8 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Unique together: (loan_id, installment_no); (loan_id, installment_no).

Relationships:
- belongs to `loan_accounts` via `loan_id` (one-to-many, 1 : 0..N; required)
- has `loan_repayments` rows via `loan_repayments.installment_id` (one-to-many, 0..1 : 0..N)

Triggers: `trg_loan_installments_stale`.

### loan_repayments

One row is one payment attempt on a loan, not one per month: a failed mandate and the part payments after it are each recorded. Delays are worked out from these rows.

Created in `029_loan_repayment_history.sql`; 10 columns; primary key (id); about 8,805 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `loan_id` | uuid | no |  | FK | loan_accounts.id |  | The loan the payment is for. |
| 3 | `installment_id` | uuid | yes |  | FK | loan_installments.id |  | The installment the payment names, if any; unnamed money pays the oldest arrears first. |
| 4 | `paid_on` | date | no |  |  |  |  | Date of the payment attempt. |
| 5 | `amount` | numeric | no |  |  |  |  | Amount of the attempt, in INR. Must be 0 or more. |
| 6 | `method` | varchar | no | 'MANDATE' |  |  | MANDATE \| UPI \| NEFT \| CASH \| CHEQUE \| CARD \| ADJUSTMENT | How it was paid: MANDATE \| UPI \| NEFT \| CASH \| CHEQUE \| CARD \| ADJUSTMENT. Defaults to MANDATE. |
| 7 | `outcome` | varchar | no | 'SUCCESS' |  |  | SUCCESS \| BOUNCED \| REVERSED | Result of the attempt: SUCCESS \| BOUNCED \| REVERSED. Defaults to SUCCESS. |
| 8 | `reference_no` | varchar | yes |  |  |  |  | Payment reference, unique within the loan. |
| 9 | `bounce_reason` | varchar | yes |  |  |  |  | Why the payment bounced, when it did. |
| 10 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Unique together: (loan_id, reference_no); (loan_id, reference_no).

Relationships:
- belongs to `loan_installments` via `installment_id` (one-to-many, 0..1 : 0..N; optional)
- belongs to `loan_accounts` via `loan_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_loan_repayments_stale`.

### loan_status_snapshot

A cache: one row per installment holding its worked-out status (paid, cleared on, days late, bounces) so the Loan portfolio page loads fast. Rebuilt by fn_loan_status_refresh; closed to the API.

Created in `062_loan_status_snapshot.sql`; 12 columns; primary key (loan_id, installment_no); about 43,932 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `loan_id` | uuid | no |  | PK, FK | loan_accounts.id |  | The loan this installment belongs to. With installment_no, it forms the key. |
| 2 | `installment_no` | int2 | no |  | PK |  |  | Position of the installment in the schedule. |
| 3 | `due_date` | date | no |  |  |  |  | Date the installment is due. |
| 4 | `amount_due` | numeric | no |  |  |  |  | Amount due for the installment, in INR. |
| 5 | `principal_due` | numeric | yes |  |  |  |  | Principal part of the installment, in INR. |
| 6 | `amount_paid` | numeric | no |  |  |  |  | Total successfully paid against the installment so far, in INR. |
| 7 | `shortfall` | numeric | no |  |  |  |  | Amount still short of the installment, in INR. A shortfall within the tolerance (default 100 INR) still counts as paid. |
| 8 | `cleared_on` | date | yes |  |  |  |  | Date the payments added up to the amount due; empty if not yet cleared. |
| 9 | `days_late` | int4 | yes |  |  |  |  | Days between the due date and the clearing date, in days. |
| 10 | `attempts` | int4 | no |  |  |  |  | Number of payment attempts on the installment. |
| 11 | `bounces` | int4 | no |  |  |  |  | Number of bounced attempts on the installment. |
| 12 | `refreshed_at` | timestamptz | no | now() |  |  |  | When this row was last rebuilt |

Relationships:
- belongs to `loan_accounts` via `loan_id` (one-to-many, 1 : 0..N; required)

### loan_status_stale

A to-do list: one row per loan whose status snapshot needs rebuilding, added whenever its installments or payments change. Cleared by fn_loan_status_refresh; closed to the API.

Created in `062_loan_status_snapshot.sql`; 2 columns; primary key (loan_id); about 0 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `loan_id` | uuid | no |  | PK, FK | loan_accounts.id |  | The loan waiting for its status snapshot to be rebuilt. One row per loan. |
| 2 | `marked_at` | timestamptz | no | now() |  |  |  | When the loan was marked for refresh |

Relationships:
- belongs to `loan_accounts` via `loan_id` (one-to-one, 1 : 0..1; required)

## Risk models

### model_versions

Inventory of risk model versions, one row per model, with when it is in use, what it was trained on, its test results and who approved and validated it. Only one model can be ACTIVE (shown to officers) at a time; SHADOW models are scored and saved but never shown.

Created in `030_decision_version_pinning.sql`; 13 columns; primary key (model_version); about 2 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `model_version` | varchar | no |  | PK |  |  | Model name, e.g. cercit-risk-v1. Key used by saved scores and decisions. |
| 2 | `status` | varchar | no | 'ACTIVE' |  |  | ACTIVE \| SHADOW \| RETIRED | Model's use: ACTIVE \| SHADOW \| RETIRED. Only one ACTIVE model at a time. |
| 3 | `effective_from` | timestamptz | no |  |  |  |  | When the model came into use. |
| 4 | `effective_to` | timestamptz | yes |  |  |  |  | When the model stopped being used. Must be after effective_from; blank while still in use. |
| 5 | `approved_by` | uuid | yes |  | FK | users.id |  | Staff user who approved the model for use. Blank if no approval was recorded. |
| 6 | `approved_at` | timestamptz | yes |  |  |  |  | When the model was approved. |
| 7 | `notes` | text | yes |  |  |  |  | Free-text notes about the model, e.g. where its version name came from. |
| 8 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 9 | `trained_on` | text | yes |  |  |  |  | Plain description of the data the model was trained on, e.g. number of synthetic rows. |
| 10 | `metrics` | jsonb | yes |  |  |  |  | Test results such as AUC, Brier score, PR-AUC, test row count and late-payment rates by grade. |
| 11 | `validated_by` | uuid | yes |  |  |  |  | Staff user who independently validated the model. |
| 12 | `validated_at` | timestamptz | yes |  |  |  |  | When the model was validated. |
| 13 | `validation_note` | text | yes |  |  |  |  | Note on the validation or why the model was chosen. |

Relationships:
- belongs to `users` via `approved_by` (one-to-many, 0..1 : 0..N; optional)
- has `credit_decisions` rows via `credit_decisions.model_version` (one-to-many, 0..1 : 0..N)
- has `model_scores` rows via `model_scores.model_version` (one-to-many, 1 : 0..N)
- has `recommendations` rows via `recommendations.model_version` (one-to-many, 0..1 : 0..N)

### model_scores

One row per model per case: the risk score each model (live and any shadow) gave a case, so models can be compared later on the same customers. Written by the case screen through fn_record_model_scores; a re-score replaces the earlier row.

Created in `093_model_governance.sql`; 7 columns; primary key (application_id, model_version); link table between applications and model_versions.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The case that was scored, from applications. |
| 2 | `model_version` | varchar | no |  | PK, FK | model_versions.model_version |  | Which model gave the score, from model_versions. |
| 3 | `probability` | numeric | no |  |  |  |  | Predicted chance of the loan going 30+ days late, as a fraction between 0 and 1. |
| 4 | `grade` | bpchar | no |  |  |  | A \| B \| C \| D \| E | Risk grade from the score: A \| B \| C \| D \| E. |
| 5 | `shown` | bool | no |  |  |  |  | True for the score officers saw; false for a shadow model's score. |
| 6 | `scored_by` | uuid | yes |  |  |  |  | Staff user whose screen scored the case. |
| 7 | `scored_at` | timestamptz | no | now() |  |  |  | When the score was saved or last replaced. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 1 : 0..N; required)
- belongs to `model_versions` via `model_version` (one-to-many, 1 : 0..N; required)

### model_controls

Single-row settings table holding the risk score kill switch. When switched off, officers see "risk score switched off" instead of a score; only someone with model.approve can change it, with a reason, and each change is audited.

Created in `093_model_governance.sql`; 5 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | bool | no | true | PK |  |  | Always true; keeps the table to one row. |
| 2 | `scores_shown` | bool | no | true |  |  |  | True shows the risk score to officers; false switches it off for everyone. |
| 3 | `reason` | text | yes |  |  |  |  | Why the switch was last changed. Must be at least 5 characters. |
| 4 | `changed_by` | uuid | yes |  |  |  |  | Staff user who last changed the switch. |
| 5 | `changed_at` | timestamptz | no | now() |  |  |  | When the switch was last changed. |

## Staff, roles and access

### users

One row per staff login (officer, manager, head, admin, demo and practice accounts). It holds each person's role, sanction limit and sign-in lock state, and is changed only through the Users screen functions, never by direct writes.

Created in `001_schema.sql`; 14 columns; primary key (id); about 12 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `email` | varchar | no |  | UK |  |  | Staff email address. Must be unique. Used to link the Supabase sign-in to this row. |
| 3 | `full_name` | varchar | no |  |  |  |  | Person's full name as shown on screens and in the audit trail. |
| 4 | `role` | varchar | no |  | FK | roles.code |  | Role code from the roles table, which sets what this person may do. A person cannot change their own role. |
| 5 | `state_code` | varchar | yes |  | FK | states.code |  | State the person works in, from the states table. Blank if not tied to a state. |
| 6 | `is_active` | bool | no | true |  |  |  | False when the account is suspended. A suspended account can still sign in but can do nothing. |
| 7 | `max_sanction_amount` | numeric | yes |  |  |  |  | Largest loan this person may approve, in INR. Set only for roles that decide cases. |
| 8 | `daily_case_limit` | int2 | yes |  |  |  |  | Most cases this person should handle in one day. |
| 9 | `auth_user_id` | uuid | yes |  |  |  |  | The matching Supabase sign-in account. Linked automatically by email when the person first signs in. |
| 10 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 11 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |
| 12 | `failed_login_count` | int2 | no | 0 |  |  |  | Failed sign-ins in a row. Reaching the lockout threshold (5 by default) locks the account; reset to 0 on a good sign-in. |
| 13 | `locked_until` | timestamptz | yes |  |  |  |  | Time the lock ends, 30 minutes by default. While locked the account can do nothing unless an admin unlocks it. |
| 14 | `last_login_at` | timestamptz | yes |  |  |  |  | When this person last signed in successfully. |

Relationships:
- belongs to `roles` via `role` (one-to-many, 1 : 0..N; required)
- belongs to `states` via `state_code` (one-to-many, 0..1 : 0..N; optional)
- has `applications` rows via `applications.assigned_officer_id` (one-to-many, 0..1 : 0..N)
- has `credit_decisions` rows via `credit_decisions.officer_id` (one-to-many, 0..1 : 0..N)
- has `employers` rows via `employers.last_verified_by` (one-to-many, 0..1 : 0..N)
- has `fraud_signals` rows via `fraud_signals.reviewed_by_id` (one-to-many, 0..1 : 0..N)
- has `model_versions` rows via `model_versions.approved_by` (one-to-many, 0..1 : 0..N)
- has `organisation_settings` rows via `organisation_settings.updated_by` (one-to-many, 0..1 : 0..N)
- has `override_logs` rows via `override_logs.approved_by_id` (one-to-many, 0..1 : 0..N)
- has `override_logs` rows via `override_logs.officer_id` (one-to-many, 1 : 0..N)
- has `policy_change_requests` rows via `policy_change_requests.requested_by` (one-to-many, 0..1 : 0..N)
- has `policy_change_reviews` rows via `policy_change_reviews.reviewer_id` (one-to-many, 1 : 0..N)
- has `policy_version_events` rows via `policy_version_events.actor_id` (one-to-many, 0..1 : 0..N)
- has `policy_versions` rows via `policy_versions.approved_by` (one-to-many, 0..1 : 0..N)
- has `policy_versions` rows via `policy_versions.authored_by` (one-to-many, 0..1 : 0..N)
- has `role_change_requests` rows via `role_change_requests.decided_by` (one-to-many, 0..1 : 0..N)
- has `role_change_requests` rows via `role_change_requests.requested_by` (one-to-many, 0..1 : 0..N)

Triggers: `trg_practice_keeps_role`, `trg_public_demo_keeps_role`, `trg_users_email_domain`, `trg_users_updated_at`.

### roles

One row per role a staff member can hold, with that role's sign-in rules (MFA, idle timeout). Roles are kept as data so the Admin screens can show them and change them through the two-person approval flow.

Created in `036_roles_and_login_rules.sql`; 12 columns; primary key (code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `code` | varchar | no |  | PK |  |  | Short role code, lowercase with underscores (e.g. credit_officer). Inactive roles found on old user rows may use capitals. |
| 2 | `name` | varchar | no |  |  |  |  | Role name shown on screens, e.g. Credit Officer. |
| 3 | `description` | text | no |  |  |  |  | Plain description of what the role does. |
| 4 | `is_system` | bool | no | false |  |  |  | True for roles shipped with cercit rather than built in the role builder. |
| 5 | `is_legacy` | bool | no | false |  |  |  | True for older roles (reviewer, viewer) kept for existing users but no longer given to new people. |
| 6 | `is_active` | bool | no | true |  |  |  | False switches the role off; an inactive role has no rights. A role still held by active users cannot be switched off. |
| 7 | `mfa_required` | bool | no | false |  |  |  | True if people in this role must use a second sign-in step. Only enforced when the mfa_enforced setting is 1. |
| 8 | `idle_timeout_minutes` | int2 | no | 15 |  |  |  | Minutes of no activity before the person is signed out. Must be between 5 and 60; 10 for senior roles, 15 otherwise. |
| 9 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |
| 10 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |
| 11 | `is_public_demo` | bool | no | false |  |  |  | True for the public demo visitor role. It may only hold view rights, and its account can never be given another role. |
| 12 | `is_practice` | bool | no | false |  |  |  | True for visitor practice roles (officer, manager, head). They can change only synthetic cases and hold a fixed list of rights. |

Relationships:
- has `role_conflict_waivers` rows via `role_conflict_waivers.role_code` (one-to-many, 1 : 0..N)
- has `role_permissions` rows via `role_permissions.role_code` (one-to-many, 1 : 0..N)
- has `users` rows via `users.role` (one-to-many, 1 : 0..N)

Triggers: `trg_roles_updated_at`.

### permissions

The catalogue of every right a role can be given, one row per right (for example app.decide or policy.approve). It is a fixed reference list that role_permissions points to.

Created in `036_roles_and_login_rules.sql`; 3 columns; primary key (code).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `code` | varchar | no |  | PK |  |  | Right code in dotted lowercase form, e.g. app.view.own or policy.approve. |
| 2 | `module` | varchar | no |  |  |  |  | Area the right belongs to: cases, policy, pricing, model, compliance, admin, audit or reports. |
| 3 | `description` | text | no |  |  |  |  | Plain description of what the right allows, as shown on the Admin screens. |

Relationships:
- has `permission_conflicts` rows via `permission_conflicts.permission_a` (one-to-many, 1 : 0..N)
- has `permission_conflicts` rows via `permission_conflicts.permission_b` (one-to-many, 1 : 0..N)
- has `role_permissions` rows via `role_permissions.permission_code` (one-to-many, 1 : 0..N)

### role_permissions

One row per right given to a role; together the rows say what each role may do. A trigger refuses a row that would give a role two conflicting rights unless that role has a recorded waiver.

Created in `036_roles_and_login_rules.sql`; 3 columns; primary key (role_code, permission_code); about 127 rows on 23 Oct 2026; link table between permissions and roles.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `role_code` | varchar | no |  | PK, FK | roles.code |  | The role being given the right, from roles. Rows are removed if the role is deleted. |
| 2 | `permission_code` | varchar | no |  | PK, FK | permissions.code |  | The right given, from permissions. Public demo and practice roles may only hold their allowed lists. |
| 3 | `granted_at` | timestamptz | no | now() |  |  |  | When the right was given to the role. |

Relationships:
- belongs to `permissions` via `permission_code` (one-to-many, 1 : 0..N; required)
- belongs to `roles` via `role_code` (one-to-many, 1 : 0..N; required)

Triggers: `trg_practice_role_rights`, `trg_public_demo_read_only`, `trg_role_permission_conflict`.

### permission_conflicts

One row per pair of rights that must not sit with one role (segregation of duties), with the reason. It is a reference list checked whenever a right is given to a role.

Created in `036_roles_and_login_rules.sql`; 3 columns; primary key (permission_a, permission_b); about 5 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `permission_a` | varchar | no |  | PK, FK | permissions.code |  | First right in the pair. Always the one that sorts first alphabetically, so each pair is stored once. |
| 2 | `permission_b` | varchar | no |  | PK, FK | permissions.code |  | Second right in the pair, which sorts after permission_a. |
| 3 | `reason` | text | no |  |  |  |  | Plain explanation of what could go wrong if one person held both rights. |

Relationships:
- belongs to `permissions` via `permission_a` (one-to-many, 1 : 0..N; required)
- belongs to `permissions` via `permission_b` (one-to-many, 1 : 0..N; required)
- has `role_conflict_waivers` rows via `role_conflict_waivers.permission_a, permission_b` (one-to-many, 1 : 0..N)

### role_conflict_waivers

One row per documented exception that lets a named role hold a conflicting pair of rights, with the reason and a review date. Each waiver stays visible in the role conflicts view until removed.

Created in `036_roles_and_login_rules.sql`; 6 columns; primary key (role_code, permission_a, permission_b); link table between permission_conflicts and roles.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `role_code` | varchar | no |  | PK, FK | roles.code |  | The role allowed to hold the pair, from roles. |
| 2 | `permission_a` | varchar | no |  | PK, FK | permission_conflicts.permission_a |  | First right of the waived pair; must match a pair in permission_conflicts. |
| 3 | `permission_b` | varchar | no |  | PK, FK | permission_conflicts.permission_b |  | Second right of the waived pair; must match a pair in permission_conflicts. |
| 4 | `reason` | text | no |  |  |  |  | Why the role is allowed to hold both rights. |
| 5 | `review_by` | date | no |  |  |  |  | Date by which the waiver should be reviewed or removed. |
| 6 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created |

Relationships:
- belongs to `permission_conflicts` via `permission_a, permission_b` (one-to-many, 1 : 0..N; required)
- belongs to `roles` via `role_code` (one-to-many, 1 : 0..N; required)

### role_change_requests

One row per proposal to create a role or change what a role may do. An admin proposes, a different person (Compliance) approves or rejects, and nothing changes until it is approved; only one open proposal per role at a time.

Created in `039_role_change_approval.sql`; 17 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `kind` | varchar | no |  |  |  | CREATE \| CHANGE | Type of proposal: CREATE \| CHANGE. |
| 3 | `role_code` | varchar | no |  |  |  |  | Code of the role being created or changed, lowercase with underscores. The admin role cannot be edited here. |
| 4 | `name` | varchar | no |  |  |  |  | Role name the proposal would set. |
| 5 | `description` | text | no |  |  |  |  | Role description the proposal would set. |
| 6 | `permissions` | text[] | no |  |  |  |  | Full list of rights the role would hold. Refused if it contains a conflicting pair the role has no waiver for. |
| 7 | `mfa_required` | bool | no |  |  |  |  | Whether the role would need a second sign-in step. |
| 8 | `idle_timeout_minutes` | int2 | no |  |  |  |  | Idle sign-out time the role would have, in minutes, between 5 and 60. |
| 9 | `is_active` | bool | no |  |  |  |  | Whether the role would be switched on. A role held by active users cannot be switched off. |
| 10 | `before_state` | jsonb | yes |  |  |  |  | Copy of the role as it was when proposed, for a CHANGE, so the approver can compare. |
| 11 | `reason` | text | no |  |  |  |  | Why the proposer wants the change. |
| 12 | `status` | varchar | no | 'PENDING' |  |  | PENDING \| APPROVED \| REJECTED \| WITHDRAWN | Where the proposal stands: PENDING \| APPROVED \| REJECTED \| WITHDRAWN. Starts as PENDING. |
| 13 | `requested_by` | uuid | yes |  | FK | users.id |  | Staff user who proposed the change. |
| 14 | `requested_at` | timestamptz | no | now() |  |  |  | When the proposal was made. |
| 15 | `decided_by` | uuid | yes |  | FK | users.id |  | Staff user who approved or rejected it. Must be a different person from the proposer. |
| 16 | `decided_at` | timestamptz | yes |  |  |  |  | When it was approved, rejected or withdrawn. |
| 17 | `decision_note` | text | yes |  |  |  |  | Note left by the person who decided. |

Relationships:
- belongs to `users` via `decided_by` (one-to-many, 0..1 : 0..N; optional)
- belongs to `users` via `requested_by` (one-to-many, 0..1 : 0..N; optional)

### security_settings

One row per sign-in security setting (password length, lockout threshold and minutes, MFA switch), each holding a whole number. Admin screens show these, and the sign-in checks read them.

Created in `036_roles_and_login_rules.sql`; 4 columns; primary key (setting_key).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `setting_key` | varchar | no |  | PK |  |  | Setting name: password_min_length, lockout_threshold, lockout_minutes or mfa_enforced. |
| 2 | `value` | int4 | no |  |  |  |  | The setting's number, e.g. 12 characters, 5 failed tries, 30 minutes. For mfa_enforced, 1 means on and 0 means off. |
| 3 | `description` | text | no |  |  |  |  | Plain explanation of the setting. The password length must also be set to match in Supabase Auth. |
| 4 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed |

Triggers: `trg_security_settings_updated_at`.

### team_reset_accounts

List of the shared team logins (Head, Manager, Officer) whose changes outside cases the Admin can undo with one button. One row per login email.

Created in `085_team_reset.sql`; 1 columns; primary key (email).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `email` | varchar | no |  | PK |  |  | Email of a shared team login whose non-case changes are journaled and can be undone by the Admin. |

### team_change_journal

Append-only journal written by a trigger: one row each time a team login adds, changes or removes a row in a settings table (employers, document-check switches, rate products). The Admin's team reset uses the saved copy to put the row back exactly.

Created in `085_team_reset.sql`; 8 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | int8 | no | nextval('team_change_journal_id_seq') | PK |  |  | Internal key, a running number |
| 2 | `table_name` | text | no |  |  |  |  | Name of the settings table the team login changed. |
| 3 | `pk` | jsonb | no |  |  |  |  | Key values identifying the changed row in that table. |
| 4 | `op` | text | no |  |  |  | INSERT \| UPDATE \| DELETE | What the team login did: INSERT \| UPDATE \| DELETE. |
| 5 | `before` | jsonb | yes |  |  |  |  | Copy of the row before the change. Blank for an INSERT, since the row did not exist. |
| 6 | `actor_id` | uuid | no |  |  |  |  | Staff user (one of the team logins) who made the change. |
| 7 | `at` | timestamptz | no | now() |  |  |  | When the change was made. |
| 8 | `undone_at` | timestamptz | yes |  |  |  |  | When the Admin's reset put the row back. Blank while the change is still in place. |

### practice_case_snapshots

One saved copy per synthetic case, taken just before a practice login first changes it, holding its status, owner and latest decision. The practice reset uses it to put the case back exactly; written only by the engine.

Created in `072_practice_roles.sql`; 8 columns; primary key (application_id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `application_id` | uuid | no |  | PK, FK | applications.id |  | The synthetic case this copy belongs to, from applications. One copy per case; removed if the case is deleted. |
| 2 | `status` | varchar | yes |  |  |  |  | Case status before the practice login touched it. |
| 3 | `approval_stage` | varchar | yes |  |  |  |  | Approval stage the case was at before the practice login touched it. |
| 4 | `assigned_officer_id` | uuid | yes |  |  |  |  | Officer the case was assigned to before the practice login touched it. |
| 5 | `final_decision_at` | timestamptz | yes |  |  |  |  | When the case had been finally decided, if it had, before practice changes. |
| 6 | `decision` | jsonb | yes |  |  |  |  | Copy of the case's latest credit decision row at the time, if any. |
| 7 | `taken_at` | timestamptz | no | now() |  |  |  | When the copy was saved. |
| 8 | `taken_by` | uuid | yes |  |  |  |  | Practice login whose first change caused the copy to be saved. |

Relationships:
- belongs to `applications` via `application_id` (one-to-one, 1 : 0..1; required)

## Audit and data protection

### audit_events

One row is one recorded event in the life of the system: a case action, decision, document, sign-in, user or role change, or settings change. It is the main audit log and is append-only through the API: website and service logins can add events but never change or delete one, and each new row is chained into audit_chain.

Created in `001_schema.sql`; 9 columns; primary key (id); about 4,558 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `application_id` | uuid | yes |  | FK | applications.id |  | The loan application (case) the event is about. Empty for events not tied to one case, such as sign-ins or settings changes. |
| 3 | `event_type` | varchar | no |  |  |  |  | Short code for what happened, for example SETTINGS_DEFAULTS_SAVED, LOAN_DISBURSED, PERSONAL_DATA_ERASED or SIMULATION_DAY. |
| 4 | `event_detail` | jsonb | no |  |  |  |  | The details of the event as JSON, such as before and after values or the records affected. Its content is part of the audit hash. |
| 5 | `actor_type` | varchar | no |  |  |  |  | Who did it. The code uses USER \| SYSTEM \| CUSTOMER; there is no CHECK, so other values are not blocked. |
| 6 | `actor_id` | uuid | yes |  |  |  |  | The staff user who did it, when actor_type is USER. Staff may only add events in their own name. Empty for system events. |
| 7 | `ip_address` | inet | yes |  |  |  |  | Network address the action came from, when captured. |
| 8 | `user_agent` | text | yes |  |  |  |  | Browser or app description the action came from, when captured. |
| 9 | `created_at` | timestamptz | no | now() |  |  |  | When the event was recorded. |

Relationships:
- belongs to `applications` via `application_id` (one-to-many, 0..1 : 0..N; optional)

Triggers: `trg_audit_chain_add`, `trg_practice_synthetic_only`.

### audit_chain

One row is one link in a hash chain, written by a trigger the moment an audit event is added, so later tampering with audit_events can be detected. Append-only: updates, deletes and truncates are refused, and a nightly AWS job copies new links to a locked S3 bucket.

Created in `092_audit_chain.sql`; 6 columns; primary key (seq); about 4,542 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `seq` | int8 | no | nextval('audit_chain_seq_seq') | PK |  |  | Running number of the link; the chain is read in this order. |
| 2 | `event_id` | uuid | no |  | UK |  |  | The audit event this link fingerprints. One link per event. |
| 3 | `content_hash` | text | no |  |  |  |  | SHA-256 fingerprint of the event (id, case, type, detail, who, when). If the event is edited later it no longer matches. |
| 4 | `prev_hash` | text | no |  |  |  |  | The link_hash of the previous link, or GENESIS for the first link. |
| 5 | `link_hash` | text | no |  |  |  |  | SHA-256 of prev_hash plus content_hash. A rewritten chain shows up as a broken link in fn_audit_chain_verify. |
| 6 | `chained_at` | timestamptz | no | now() |  |  |  | When the link was added. |

Triggers: `trg_audit_chain_no_change`, `trg_audit_chain_no_truncate`.

### app_secrets

One row is one secret value the database needs, today the key used to encrypt and hash personal data (pii_key). No website or API role can read it; only owner-run database functions use it.

Created in `012_pii_encryption.sql`; 3 columns; primary key (name).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `name` | text | no |  | PK |  |  | Name of the secret, unique. Currently pii_key, the key for encrypting personal data and making PAN lookup hashes. |
| 2 | `value` | text | no |  |  |  |  | The secret itself, a long random string. Read only by owner-run functions such as fn_pii_key; never copied into settings backups. |
| 3 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created. |

### data_protection_settings

Single-row settings table for how long customer data is kept under the DPDP Act and RBI KYC rules. fn_retention_due uses it to list customers past their keep period; a person decides on each, nothing is erased by itself.

Created in `080_data_erasure.sql`; 4 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | int2 | no | 1 | PK |  |  | Always 1; the CHECK allows only one row. |
| 2 | `loan_retention_years` | int2 | no | 5 |  |  |  | Years to keep a borrower's data after the loan closes. Minimum 5, as RBI's KYC Master Direction and PMLA rules require. Default 5. |
| 3 | `no_loan_retention_days` | int2 | no | 180 |  |  |  | Days to keep data after a decision when no loan was made. Allowed 30 to 3650; default 180, a value still to confirm. |
| 4 | `updated_at` | timestamptz | no | now() |  |  |  | When the settings were last changed. |

### erasure_requests

One row is one customer's request to have their personal data erased, from receipt to the outcome. Run from the SQL editor only; erasure blanks or deletes personal data but keeps applications, decisions, loans and the audit log.

Created in `080_data_erasure.sql`; 9 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key; the request id used by fn_erasure_execute and fn_erasure_refuse. |
| 2 | `customer_id` | uuid | no |  | FK | customers.id |  | The customer whose data is to be erased. |
| 3 | `received_via` | varchar | no |  |  |  | EMAIL \| PHONE \| LETTER \| IN_PERSON \| RETENTION \| OTHER | How the request arrived: EMAIL \| PHONE \| LETTER \| IN_PERSON \| RETENTION \| OTHER. RETENTION means the keep period ran out. |
| 4 | `note` | text | yes |  |  |  |  | Free-text note about the request, for example when it was asked. |
| 5 | `status` | varchar | no | 'PENDING' |  |  | PENDING \| ERASED \| REFUSED | Where the request stands: PENDING \| ERASED \| REFUSED. Starts as PENDING. |
| 6 | `requested_at` | timestamptz | no | now() |  |  |  | When the request was recorded. |
| 7 | `closed_at` | timestamptz | yes |  |  |  |  | When the request was erased or refused. Empty while pending. |
| 8 | `refused_reason` | text | yes |  |  |  |  | Why it was refused, for example an open application, a live loan, or a closed loan still inside the 5-year retention period. |
| 9 | `summary` | jsonb | yes |  |  |  |  | JSON count of what was erased, per table, including files queued for deletion and the sign-in account. Filled when erased. |

Relationships:
- belongs to `customers` via `customer_id` (one-to-many, 1 : 0..N; required)
- has `document_storage_deletions` rows via `document_storage_deletions.request_id` (one-to-many, 1 : 0..N)

## Platform settings

### tenants

One row is one lender using the system. Only cercit exists today (a fixed default id); the tenant column is added to new tables from the start so a second lender would not mean changing every table.

Created in `015_tenants_and_feature_flags.sql`; 6 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no |  | PK |  |  | Internal key. The default tenant has the fixed id 00000000-0000-0000-0000-000000000001. |
| 2 | `code` | varchar | no |  | UK |  |  | Short unique code for the lender, for example cercit. |
| 3 | `name` | varchar | no |  |  |  |  | The lender's display name, for example cercit Vehicle Finance Ltd. |
| 4 | `is_active` | bool | no | true |  |  |  | Whether the lender is active. Default yes. |
| 5 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created. |
| 6 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed; set automatically on update. |

Relationships:
- has `feature_flags` rows via `feature_flags.tenant_id` (one-to-many, 1 : 0..N)
- has `loan_accounts` rows via `loan_accounts.tenant_id` (one-to-many, 1 : 0..N)
- has `organisation_settings` rows via `organisation_settings.tenant_id` (one-to-one, 1 : 0..1)
- has `policy_versions` rows via `policy_versions.tenant_id` (one-to-many, 1 : 0..N)

Triggers: `trg_tenants_updated_at`.

### feature_flags

One row is one on/off switch for a module, per lender. New modules are built behind a switch and turned on only after they pass their checks; screens and database functions treat a missing row as off.

Created in `015_tenants_and_feature_flags.sql`; 9 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `tenant_id` | uuid | no | fn_default_tenant_id() | FK | tenants.id |  | The lender this switch belongs to. Defaults to the cercit tenant. |
| 3 | `flag_key` | varchar | no |  |  |  |  | Name of the switch, unique per lender. Lowercase letters, digits and underscores, starting with a letter, for example server_engine. |
| 4 | `module` | varchar | no |  |  |  |  | The module the switch belongs to, for example foundation, admin, kyc, underwriting, sanction, compliance or roof. |
| 5 | `description` | varchar | no |  |  |  |  | Plain description of what turning the switch on does. |
| 6 | `enabled` | bool | no | false |  |  |  | Whether the switch is on. Starts off. Every change is copied to feature_flag_history. |
| 7 | `changed_by` | uuid | yes |  |  |  |  | The staff user who last changed the switch. |
| 8 | `created_at` | timestamptz | no | now() |  |  |  | When the row was created. |
| 9 | `updated_at` | timestamptz | no | now() |  |  |  | When the row was last changed; set automatically on update. |

Unique together: (tenant_id, flag_key); (tenant_id, flag_key).

Relationships:
- belongs to `tenants` via `tenant_id` (one-to-many, 1 : 0..N; required)

Triggers: `trg_feature_flags_log`, `trg_feature_flags_updated_at`.

### feature_flag_history

One row is one change to a module switch, written by a trigger when a switch is created or turned on or off. Kept so the compliance view and audit log can show when each module was switched.

Created in `015_tenants_and_feature_flags.sql`; 8 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `flag_id` | uuid | no |  |  |  |  | The switch that changed. |
| 3 | `tenant_id` | uuid | no |  |  |  |  | The lender the switch belongs to. |
| 4 | `flag_key` | varchar | no |  |  |  |  | Name of the switch at the time of the change. |
| 5 | `old_enabled` | bool | yes |  |  |  |  | Whether the switch was on before the change. Empty when the switch was first created. |
| 6 | `new_enabled` | bool | no |  |  |  |  | Whether the switch is on after the change. |
| 7 | `changed_by` | uuid | yes |  |  |  |  | The staff user who made the change, when known. |
| 8 | `changed_at` | timestamptz | no | now() |  |  |  | When the change was made. |

### organisation_settings

One row per lender holding who they are, how customers reach them and which email domains staff must use. Changed by an admin (org.manage right), every change audited; public parts are readable by anyone because RBI digital-lending rules expect them published.

Created in `041_organisation_settings.sql`; 17 columns; primary key (tenant_id); about 1 rows on 23 Oct 2026.

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `tenant_id` | uuid | no | fn_default_tenant_id() | PK, FK | tenants.id |  | The lender these settings belong to; one row per lender. Defaults to the cercit tenant. |
| 2 | `company_name` | varchar | no |  |  |  |  | Name shown on the site, for example cercit. |
| 3 | `legal_name` | varchar | yes |  |  |  |  | Registered legal name of the company. |
| 4 | `cin` | varchar | yes |  |  |  |  | Company Identification Number, 21 characters in the official format. Starts empty: a made-up CIN must never appear real. |
| 5 | `rbi_registration_no` | varchar | yes |  |  |  |  | RBI registration number, 4 to 30 letters, digits, dots, slashes or dashes. Starts empty in this demo. |
| 6 | `gstin` | varchar | yes |  |  |  |  | GST registration number, 15 characters in the official format. |
| 7 | `registered_address` | text | yes |  |  |  |  | Registered office address. |
| 8 | `support_email` | varchar | yes |  |  |  |  | Customer support email; must look like a valid email address. |
| 9 | `support_phone` | varchar | yes |  |  |  |  | Customer support phone; 6 to 20 digits, spaces, plus, brackets or dashes. |
| 10 | `grievance_officer_name` | varchar | yes |  |  |  |  | Name of the grievance redressal officer customers can complain to. |
| 11 | `grievance_officer_email` | varchar | yes |  |  |  |  | Grievance officer's email; must look like a valid email address. |
| 12 | `grievance_officer_phone` | varchar | yes |  |  |  |  | Grievance officer's phone; 6 to 20 digits, spaces, plus, brackets or dashes. |
| 13 | `grievance_reply_days` | int2 | no | 7 |  |  |  | Days within which a grievance gets a reply. Allowed 1 to 30; default 7. |
| 14 | `staff_email_domains` | text[] | no | ARRAY[] |  |  |  | Email domains staff accounts may use, for example cercit.in. Staff only, not public. |
| 15 | `restrict_staff_domains` | bool | no | false |  |  |  | When on, the database refuses any staff account outside staff_email_domains. Can only be on if at least one domain is listed. |
| 16 | `updated_at` | timestamptz | no | now() |  |  |  | When the settings were last changed. |
| 17 | `updated_by` | uuid | yes |  | FK | users.id |  | The staff user who last changed the settings. |

Relationships:
- belongs to `tenants` via `tenant_id` (one-to-one, 1 : 0..1; required)
- belongs to `users` via `updated_by` (one-to-many, 0..1 : 0..N; optional)

### simulation_settings

Single-row settings table for the daily simulation that keeps the synthetic loan book moving (new leads, disbursals, payments). Demo only; it must be switched off before real use.

Created in `075_daily_simulation.sql`; 4 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | bool | no | true | PK |  |  | Always true; the CHECK allows only one row. |
| 2 | `simulation_enabled` | bool | no | true |  |  |  | Whether the daily simulation runs. On for cercit; turn off to stop it. |
| 3 | `daily_leads` | int2 | no | 10 |  |  |  | Number of new synthetic leads made each day. Allowed 0 to 100; default 10. |
| 4 | `reset_practice_daily` | bool | no | true |  |  |  | Whether the practice cases are reset each day as part of the run. Default yes. |

### sim_daily_runs

One row per simulated day, holding a one-line summary of what the daily simulation did. Written only by the simulation job; a day already in the table is skipped unless replayed.

Created in `075_daily_simulation.sql`; 3 columns; primary key (day).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `day` | date | no |  | PK |  |  | The calendar day that was simulated; one row per day. |
| 2 | `summary` | jsonb | no |  |  |  |  | JSON summary of the day: leads made, cases disbursed, payments on time, bounced and late, and similar counts. |
| 3 | `ran_at` | timestamptz | no | now() |  |  |  | When the simulation for that day last ran. |

### settings_baselines

One row is a named snapshot of every setting (switches, document checks, organisation, security, roles, policy, pricing, simulation). Used to reset settings to saved defaults; covers settings only, never applications, customers or loans.

Created in `076_settings_defaults.sql`; 5 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `name` | varchar | no |  | UK |  |  | Unique name of the snapshot, for example Defaults 2 Oct 2026. |
| 3 | `snapshot` | jsonb | no |  |  |  |  | All settings captured at that moment, as JSON. A reset compares against it and puts settings back. |
| 4 | `taken_at` | timestamptz | no | now() |  |  |  | When the snapshot was taken. |
| 5 | `taken_by` | uuid | yes |  |  |  |  | The admin who saved it. Empty for the first baseline taken when the migration ran. |

### settings_backups

One row is one full backup copy of every settings, policy and pricing table, stored as JSON so a table can be rebuilt from it. Taken weekly by a scheduled job (last 26 weekly kept) or by hand; never holds customer, application, loan, user data or app_secrets.

Created in `079_settings_backup.sql`; 5 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `kind` | varchar | no | 'WEEKLY' |  |  | WEEKLY \| MANUAL | How the backup was taken: WEEKLY \| MANUAL. Default WEEKLY. Only weekly backups are trimmed to the newest 26. |
| 3 | `taken_at` | timestamptz | no | now() |  |  |  | When the backup was taken. |
| 4 | `tables` | jsonb | no |  |  |  |  | Every row of each backed-up table, as JSON, keyed by table. |
| 5 | `row_count` | int4 | no |  |  |  |  | Total number of rows copied in this backup. |

### app_feedback

One row is one piece of feedback a demo visitor gave when signing out. All answers are optional; the Admin reads them on the Users page.

Created in `086_feedback.sql`; 14 columns; primary key (id).

| # | Column | Type | Null | Default | Key | Refers to | Allowed | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | uuid | no | gen_random_uuid() | PK |  |  | Internal key |
| 2 | `user_id` | uuid | yes |  |  |  |  | The signed-in staff login that gave the feedback. |
| 3 | `role_code` | varchar | yes |  |  |  |  | The role they were signed in as, for example Head, Manager or Officer. |
| 4 | `experience` | int2 | yes |  |  |  |  | Star rating of how it was, 1 to 5. |
| 5 | `findability` | varchar | yes |  |  |  |  | Could they find what they needed: YES \| MOSTLY \| NO. |
| 6 | `needed` | text | yes |  |  |  |  | What is missing and why it would help. Up to 2,000 characters. |
| 7 | `bugs` | text | yes |  |  |  |  | Anything broken they noticed. Up to 2,000 characters. |
| 8 | `page` | varchar | yes |  |  |  |  | The page they were on when they signed out. |
| 9 | `created_at` | timestamptz | no | now() |  |  |  | When the feedback was given. |
| 10 | `lost_where` | text | yes |  |  |  |  | What they couldn't find, asked when they answered MOSTLY or NO. Up to 1,000 characters. |
| 11 | `profile` | varchar | yes |  |  |  |  | Who they are: LENDING \| PRODUCT \| STUDENT \| HIRING \| OTHER. |
| 12 | `name` | varchar | yes |  |  |  |  | Optional name. Real personal data, used only to reply and shown only in the Admin's list. |
| 13 | `contact` | varchar | yes |  |  |  |  | Optional email or LinkedIn. Can only be saved when contact_ok is yes; used only to reply. |
| 14 | `contact_ok` | bool | no | false |  |  |  | Whether they agreed to be contacted about this feedback. Default no. |
