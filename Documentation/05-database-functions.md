# Database functions

All 286 functions in the `public` schema (23 Oct 2026). SECURITY DEFINER = runs with the owner's rights and checks the caller's permission itself. `Last defined in` is the latest migration with a CREATE for it; some were later patched in place by a migration (see the migration run log).

| Function | Arguments | Returns | Definer | Last defined in | Patched by | Note |
|---|---|---|---|---|---|---|
| `fn_add_working_days` | p_from date, p_days integer | date |  | 049_after_approval.sql |  |  |
| `fn_admin_list_users` |  | TABLE(id uuid, email text, full_name text, role text, role_n | yes | 037_user_admin.sql |  | The list behind the Users screen. Anyone with user.view sees it; the screen shows the change buttons only to those with user.manage. |
| `fn_admin_save_user` | p_user_id uuid, p_email text, p_full_name text, p_role text, p_state_code text, p_max_sanction_amount numeric, p_daily_case_limit integer | uuid | yes | 037_user_admin.sql |  | * every change is written to audit_events with the before and after values A sign-in for the new person is sent from the screen (Supabase emails them a code); 0 |
| `fn_admin_set_user_active` | p_user_id uuid, p_active boolean, p_reason text | void | yes | 037_user_admin.sql |  |  |
| `fn_after_approval_data` | p_app uuid | jsonb | yes | 049_after_approval.sql |  | 3. Everything after approval, for one application (customer or staff view) |
| `fn_apr` | p_net numeric, p_emi numeric, p_months integer | numeric |  | 049_after_approval.sql |  | APR as the KFS defines it: the annual rate at which the EMIs repay the amount the borrower actually gets after the upfront charges (monthly IRR x 12). |
| `fn_assess_application` | p_application_id uuid | jsonb | yes | 004_functions.sql |  | 6. Full assessment pipeline (runs policy engine + generates recommendation) Single call from the frontend |
| `fn_audit_chain_add` |  | trigger | yes | 092_audit_chain.sql |  | Add one event to the chain (one writer at a time, so the chain never forks). |
| `fn_audit_chain_append_only` |  | trigger |  | 092_audit_chain.sql |  | The chain can only grow. |
| `fn_audit_chain_verify` |  | jsonb | yes | 092_audit_chain.sql |  | Walk the chain and say what, if anything, has changed. |
| `fn_audit_content_hash` | e audit_events | text |  | 092_audit_chain.sql |  | The fingerprint of one event. |
| `fn_audit_export` | p_after_seq bigint, p_limit integer | jsonb | yes | 092_audit_chain.sql |  | For the nightly copy to S3 (service key only): links after a sequence number, with their events. |
| `fn_audit_link` | p_prev text, p_content text | text |  | 092_audit_chain.sql |  |  |
| `fn_audit_log` | p_from timestamp with time zone, p_to timestamp with time zone, p_actor text, p_activity text, p_case text, p_search text, p_page integer, p_page_size integer | jsonb | yes | 065_audit_log.sql |  |  |
| `fn_auto_review_documents` | p_app uuid, p_trigger text | jsonb | yes | 052_auto_document_checks.sql |  | 6. The engine |
| `fn_bureau_assemble` | p_customer uuid, p_app uuid, p_as_of date, OUT summaries bureau_summary[], OUT accounts bureau_accounts[], OUT enquiries bureau_enquiries[] | record | yes | 053_bureau_detail.sql |  | Simulate and combine for one customer, without writing anything. |
| `fn_bureau_combine` | p_app uuid | jsonb | yes | 053_bureau_detail.sql |  | Work out the summaries from the stored per-bureau pulls, and write the engine row if there is none. The engine row is never rewritten, so a recombine changes th |
| `fn_bureau_combine_arrays` | p_heads bureau_summary[], p_accts bureau_accounts[], p_enqs bureau_enquiries[], p_as_of date, OUT summaries bureau_summary[], OUT accounts bureau_accounts[] | record |  | 053_bureau_detail.sql |  | Per-bureau summaries plus COMBINED, and the accounts with merged_seq set. Shared by the stored pull, the preview and the tests. |
| `fn_bureau_detail_json` | p_app uuid | jsonb | yes | 053_bureau_detail.sql |  | Everything an officer needs to read both bureaus side by side. detail is false for reports from before 053 (v1 simulated, staff, seed rows). |
| `fn_bureau_enquiries_union` | p bureau_enquiries[] | bureau_enquiries[] |  | 053_bureau_detail.sql |  | Enquiries on both bureaus: the same lender on the same day on the two bureaus counts once (CIBIL's copy kept). Two on one bureau stay two: the n-th copy on one  |
| `fn_bureau_income_anchor` | p_app uuid, p_customer uuid | integer | yes | 053_bureau_detail.sql |  | The salary loan sizes are scaled to: this application's, else the customer's newest. |
| `fn_bureau_match` | p bureau_accounts[] | bureau_accounts[] |  | 053_bureau_detail.sql |  | Which accounts on two bureaus are the same loan. Repeated mutual-best passes: same lender and product, opened within 31 days, the same amount within 2% (cards:  |
| `fn_bureau_measures` | p_bureau text, p_accts bureau_accounts[], p_enqs bureau_enquiries[], p_as_of date | bureau_summary |  | 053_bureau_detail.sql |  | Every measure for one bureau, or for the merged accounts (bureau 'COMBINED'). STABLE, not IMMUTABLE: stale_lender_accounts reads bureau_lenders. |
| `fn_bureau_monthly_emi` | p_emi integer, p_freq character | integer |  | 053_bureau_detail.sql |  | An instalment in any payment frequency, as a monthly amount. |
| `fn_bureau_product` | p_bureau text, p_raw text | TABLE(product character varying, secured boolean, revolving  | yes | 053_bureau_detail.sql |  | A bureau's product name -> our product: the bureau's own row, then '*', then OTHER. |
| `fn_bureau_pull_simulated` | p_app uuid, p_pulled_at timestamp with time zone | jsonb | yes | 053_bureau_detail.sql |  | The single entry point for a simulated pull: the officer's credit check, the automatic checks and the synthetic-data generator all come here. Pulls once: a repo |
| `fn_bureau_revolving_in_foir` |  | boolean |  | 053_bureau_detail.sql |  | true: the 5% is part of total_monthly_emi (and so of FOIR). false: it is still worked out and shown, but left out of the obligation. Rows already stored keep th |
| `fn_bureau_revolving_rate` |  | numeric |  | 053_bureau_detail.sql |  | R11: cards and overdrafts have no EMI, so this share of the OUTSTANDING counts as their monthly obligation. The only place the number lives. |
| `fn_bureau_seed` | p_customer uuid | text | yes | 053_bureau_detail.sql |  | The simulator's seed: the PAN blind index (so the same PAN always gets the same report). |
| `fn_bureau_sim_lenders` |  | TABLE(lender_no smallint, lender_code character varying, len |  | 053_bureau_detail.sql |  | Lenders and the names bureaus print for them: a short name, a full or former name, a registered foreign name. Every alias key is distinct. Lender 13 is delibera |
| `fn_bureau_sim_products` |  | TABLE(product character varying, secured boolean, revolving  |  | 053_bureau_detail.sql |  | Our products and the names bureaus print for them (20 distinct names). |
| `fn_bureau_sim_raw` | p_seed text, p_as_of date, p_income integer, OUT heads bureau_summary[], OUT accounts bureau_accounts[], OUT enquiries bureau_enquiries[] | record | yes | 053_bureau_detail.sql |  | The two simulated bureau reports for one customer, before any combining. Blocks: C = customer (coverage, scores, counts), X = events, A<n> = account n, E<k> = e |
| `fn_bureau_sim_version` |  | text |  | 053_bureau_detail.sql |  | Bump on ANY change to the simulator's logic. |
| `fn_bureau_union` | p bureau_accounts[], p_live boolean | bureau_accounts[] |  | 053_bureau_detail.sql |  |  |
| `fn_calculate_emi` | p_principal numeric, p_annual_rate numeric, p_tenure_months integer | numeric |  | 004_functions.sql |  | 2. EMI calculator (reducing balance) EMI = P * r * (1+r)^n / ((1+r)^n - 1) |
| `fn_case_employer_category` | p_application uuid | jsonb | yes | 070_employer_category_pricing.sql |  | The case's employer and category: the Employer Master's when the employer is there (verified or provisional), otherwise provisional from the type the customer g |
| `fn_check_address` | p jsonb, p_label text | void |  | 046_customer_details_submit.sql |  |  |
| `fn_check_officer_limits` |  | trigger | yes | 068_case_scope_limits_roles.sql |  | B5. Daily case limit and sanction limit on officer decisions |
| `fn_consent_text` | p_purpose text | jsonb | yes | 043_customer_onboarding.sql |  | 5. Step 1 — start (or resume) an application |
| `fn_create_application` | p_full_name character varying, p_email character varying, p_mobile character varying | jsonb | yes | 004_functions.sql |  | 7. Create application (Step 1 — registration) Creates customer + application, returns application_id |
| `fn_current_staff_id` |  | uuid | yes | 036_roles_and_login_rules.sql |  | A locked account is treated like a deactivated one: its login still works, but nothing behind it does. So is a role that needs a second sign-in step when the pe |
| `fn_customer_accept_offer` | p_application_id text, p_kfs_hash text, p_user_agent text | jsonb | yes | 049_after_approval.sql |  |  |
| `fn_customer_after_approval` | p_application_id text | jsonb | yes | 049_after_approval.sql |  |  |
| `fn_customer_can_upload` | p_application_id text | boolean | yes | 047_staff_customer_cases.sql |  | 1. Asked by the upload service before it hands out an upload link |
| `fn_customer_checks_core` | p_app uuid, p_read jsonb, p_actor uuid | jsonb | yes | 055_synthetic_customers.sql |  | The income-variance rule (INC-VARIANCE, 5%) compared declared take-home pay with slip net, bank salary AND Form 16 / 12. Form 16 is gross income, so it always l |
| `fn_customer_current` |  | jsonb | yes | 045_document_capture.sql |  | The resume view carries how each document may be captured |
| `fn_customer_details` | p_application_id text | jsonb | yes | 046_customer_details_submit.sql |  | 4. Step 4: read and save the three groups |
| `fn_customer_draft_uuid` | p_application_id text | uuid | yes | 043_customer_onboarding.sql |  | The caller's own draft application by its number, or an error. |
| `fn_customer_me` |  | uuid | yes | 043_customer_onboarding.sql |  | The caller's customer id, or an error. Staff logins are refused: one person cannot be both lender and borrower on the same login. |
| `fn_customer_open_uuid` | p_application_id text, p_doc_type text | uuid | yes | 049_after_approval.sql |  | 7. Uploads, tracking and document checks after approval (047 functions, widened) |
| `fn_customer_pii` | p_customer_id uuid, p_reason text | TABLE(pan_number text, mobile text) | yes | 018_permission_checks.sql |  | 4. PII reveal — same rule, now through the shared check |
| `fn_customer_register_document` | p_application_id text, p_doc_type text, p_side text, p_storage_key text, p_file_name text, p_mime_type text, p_size_bytes bigint, p_sha256 text, p_backend text, p_was_locked boolean, p_unlocked boolean, p_masked boolean | jsonb | yes | 047_staff_customer_cases.sql |  | Same as 045 except for the first line: a submitted application is open for a document the officer asked for again. |
| `fn_customer_resume_lookup` | p_mobile text | jsonb | yes | 051_returning_customers.sql |  | applications, so a customer who had already submitted was treated as new. It now finds the customer from any application; after the email code the website sends |
| `fn_customer_save_details` | p_application_id text, p_group text, p jsonb, p_prefilled jsonb | jsonb | yes | 046_customer_details_submit.sql |  |  |
| `fn_customer_save_vehicle` | p_application_id text, p jsonb | jsonb | yes | 043_customer_onboarding.sql |  | 6. Step 2 — car details (from the quotation, or typed in) |
| `fn_customer_set_mandate` | p_application_id text, p jsonb | jsonb | yes | 049_after_approval.sql |  |  |
| `fn_customer_sign_agreement` | p_application_id text, p_content_hash text, p_signer_name text, p_user_agent text | jsonb | yes | 049_after_approval.sql |  |  |
| `fn_customer_start` | p_first_name text, p_middle_name text, p_last_name text, p_mobile text, p_mobile_method text, p_consent_version text, p_user_agent text | jsonb | yes | 043_customer_onboarding.sql |  |  |
| `fn_customer_submit` | p_application_id text, p_bureau_consent_version text, p_user_agent text | jsonb | yes | 046_customer_details_submit.sql |  | 5. Submit |
| `fn_customer_track` |  | jsonb | yes | 049_after_approval.sql |  | Tracking (046) now gives what the upload box needs for each item waiting on the customer. |
| `fn_decision_versions` | p_application_id uuid | TABLE(source text, outcome character varying, decided_at tim | yes | 030_decision_version_pinning.sql |  | 6. Reading it back: what a decision was made under |
| `fn_default_tenant_id` |  | uuid |  | 015_tenants_and_feature_flags.sql |  |  |
| `fn_doc_check` | p_app uuid, p_doc text, p_check text, p_threshold numeric, p_wait_minutes integer | TABLE(result text, detail text) | yes | 052_auto_document_checks.sql |  | 4. One check Returns PASS, FAIL (a real finding), UNREAD (the reader could not tell; a person looks, the customer is never asked again for it) or WAITING (not r |
| `fn_doc_conf` | p_app uuid, p_reader text, p_field text | numeric | yes | 052_auto_document_checks.sql |  |  |
| `fn_doc_date` | p text | date |  | 052_auto_document_checks.sql |  | 02/06/1991, 02-06-1991, 02.06.1991 or 1991-06-02 -> date; anything else -> null. |
| `fn_doc_month` | p text | date |  | 052_auto_document_checks.sql |  | "September 2026", "Sep-26", "09/2026", "2026-09" -> the first of that month. |
| `fn_doc_name_score` | p_a text, p_b text | numeric |  | 094_name_lookalikes.sql |  | 052 / 090, plus: l and i count as the same letter (094). |
| `fn_doc_num` | p text | numeric |  | 052_auto_document_checks.sql |  | "85,400.00", "Rs 85400" -> 85400; not a number -> null. |
| `fn_doc_one_slip` | a text, b text | boolean |  | 090_kyc_name_fed.sql |  | True when two words of 5+ letters differ by one letter (changed, added or dropped). |
| `fn_doc_org_score` | p_a text, p_b text | numeric |  | 052_auto_document_checks.sql |  | Employer names: the same, after dropping the words every company name has. |
| `fn_doc_read` | p_app uuid, p_reader text, p_field text | text | yes | 052_auto_document_checks.sql |  | The reader's value for a field, and its confidence (1 when the reader gave none). |
| `fn_doc_word_canon` | w text | text |  | 090_kyc_name_fed.sql |  | Common spelling variants of Indian name words, mapped to one form. |
| `fn_doc_words` | p text | text[] |  | 094_name_lookalikes.sql |  | Different people still don't match; employer matching (fn_doc_org_score) gets the same benefit through fn_doc_name_score. The AWS cross-document check (cross_va |
| `fn_document_upload_types` |  | jsonb | yes | 049_after_approval.sql |  | The upload screens get the stage, so step 3 lists only application documents. |
| `fn_dpd_align` | p smallint[], p_shift integer | smallint[] |  | 053_bureau_detail.sql |  | A 24-month grid (newest first) moved to a grid that ends p_shift months later. |
| `fn_dpd_shifted_out_max` | p smallint[], p_shift integer | smallint |  | 053_bureau_detail.sql |  | The worst days-late in the cells fn_dpd_align(p, p_shift) pushes off the end of the grid (they become months 25 and on); -1 when none is reported. Folded into d |
| `fn_dpd_window_max` | p smallint[], p_from integer, p_to integer | smallint |  | 053_bureau_detail.sql |  | The worst days-late in months p_from..p_to of a grid (0 when nothing reported). |
| `fn_dpd_worst` | a smallint[], b smallint[] | smallint[] |  | 053_bureau_detail.sql |  | The worse of two grids, month by month. |
| `fn_emi` | p_principal numeric, p_rate_pct numeric, p_months integer | numeric |  | 049_after_approval.sql |  | 1. Loan arithmetic |
| `fn_employer_category_rule` | p_type text, p_listed boolean, p_years smallint, p_status text | character |  | 069_employer_master.sql |  | The category the policy gives an employer. |
| `fn_employer_checks_internal` | p_employer uuid, p_actor uuid | jsonb | yes | 069_employer_master.sql |  | Run every master check on one employer, record each, and bring the derived fields up to date. Returns the checks and the category the rule gives. |
| `fn_employer_decide_category` | p_request uuid, p_action text, p_note text | jsonb | yes | 069_employer_master.sql |  | Approve or reject someone else's request. Withdraw your own. |
| `fn_employer_for_application` | p_application uuid | jsonb | yes | 069_employer_master.sql |  | 8. Per case: which employer, its category, and the two case checks Matches the case's employer name (customer details, payslips, Form 16) to the master by name  |
| `fn_employer_get` | p_id uuid | jsonb | yes | 069_employer_master.sql |  | One employer: every field, the latest result of each check, the category the rule gives, and the category change history. |
| `fn_employer_key` | p_name text | text |  | 069_employer_master.sql |  | 1. Name key: the same employer under small spelling differences "Infosys Ltd", "Infosys Limited" and "INFOSYS LTD." share the key "infosys". |
| `fn_employer_list` | p_search text, p_category text | jsonb | yes | 069_employer_master.sql |  | The list, with search, category filter and per-employer case figures. |
| `fn_employer_request_category` | p_id uuid, p_category text, p_reason text | uuid | yes | 069_employer_master.sql |  | Ask for a category change (a second person approves it). |
| `fn_employer_run_checks` | p_id uuid | jsonb | yes | 069_employer_master.sql |  | Run the checks. When they all pass (or don't apply) the employer is verified; when the rule gives a different category, a change request is opened for a second  |
| `fn_employer_save` | p_id uuid, p jsonb | uuid | yes | 069_employer_master.sql |  | Add or edit an employer. The category is not edited here: a new employer gets the category the rule gives; a change goes through a request. |
| `fn_employer_seed_from_applications` |  | integer | yes | 069_employer_master.sql |  | Also run by the daily simulation (G7) for employers new customers name. |
| `fn_engine_decision` | p_application_id uuid | TABLE(decision character varying, version_code character var | yes | 033_server_engine_decisions.sql |  | 4. Reading it back What the engine last said about a case, for the case screen and for comparing the two engines while the switch is still off. |
| `fn_engine_decision_record` | p_application_id uuid, p_decision text, p_version_id uuid, p_version_code text, p_score integer, p_hard text[], p_soft text[], p_facts_not_known text[] | jsonb | yes | 033_server_engine_decisions.sql |  | 3. Recording it, and applying it when the switch is on |
| `fn_erasure_blank` | p_table text, p_column text, p_key text, p_ids uuid[] | bigint | yes | 080_data_erasure.sql |  | Blanks one column for the given applications: NULL where allowed, else an empty value of its type |
| `fn_erasure_check` | p_customer uuid | jsonb | yes | 080_data_erasure.sql |  | What erasure would do for a customer, and whether the law says keep the data |
| `fn_erasure_execute` | p_request uuid, p_confirm text | jsonb | yes | 080_data_erasure.sql |  |  |
| `fn_erasure_find` | p_email text | jsonb | yes | 080_data_erasure.sql |  | Find a customer by email: ids only, never their details |
| `fn_erasure_record` | p_customer uuid, p_via text, p_note text | uuid | yes | 080_data_erasure.sql |  |  |
| `fn_erasure_refuse` | p_request uuid, p_reason text | void | yes | 080_data_erasure.sql |  |  |
| `fn_erasure_require_operator` |  | void | yes | 080_data_erasure.sql |  |  |
| `fn_erasure_storage_done` | p_keys text[] | integer | yes | 080_data_erasure.sql |  |  |
| `fn_erasure_storage_queue` |  | TABLE(request_id uuid, storage_backend character varying, st | yes | 080_data_erasure.sql |  | Files waiting to be deleted from storage, and marking them done |
| `fn_face_matches` | p_application_id text | jsonb | yes | 050_customer_privacy.sql |  | Staff: the latest face match per document for one application. |
| `fn_feature_enabled` | p_flag_key text, p_tenant_id uuid | boolean |  | 015_tenants_and_feature_flags.sql |  | Unknown keys are off. Database functions call this before using new code paths. |
| `fn_feedback_list` | p_limit integer | TABLE(id uuid, created_at timestamp with time zone, role_nam | yes | 087_feedback_details.sql |  | The Admin's view: newest first, with the role (not the person) |
| `fn_feedback_submit` | p jsonb | uuid | yes | 087_feedback_details.sql |  |  |
| `fn_first_conflict` | p_role text, p_permissions text[] | text | yes | 039_role_change_approval.sql |  | The first conflicting pair a set of rights would put on one role, ignoring pairs the role has a waiver for. NULL when the set is clean. |
| `fn_first_emi_date` | p_disbursed date | date |  | 049_after_approval.sql |  | First EMI: the 5th of the month after disbursement, at least 15 days away. |
| `fn_fresh_code_at` |  | timestamp with time zone |  | 049_after_approval.sql |  | An email code entered in the last 15 minutes (same test as submit, 046). |
| `fn_generate_application_id` |  | character varying |  | 004_functions.sql |  |  |
| `fn_generate_recommendation` | p_application_id uuid | jsonb | yes | 070_employer_category_pricing.sql |  | 2. The recommendation, with the three changes above |
| `fn_gstin_valid` | p_gstin text | boolean |  | 069_employer_master.sql |  | GSTIN: 2-digit state, 10-character PAN, entity number, 'Z', check character (mod 36). |
| `fn_has_permission` | p_permission text | boolean |  | 018_permission_checks.sql |  |  |
| `fn_in_principle_check` | p_application_id uuid | jsonb | yes | 004_functions.sql |  | 3. In-principle check (Step 4 — quick eligibility on declared numbers) Returns JSON: { eligible, max_loan, rate, tenure, emi, foir_pct, ltv_pct, reasons[] } |
| `fn_income_annual_tax` | p_taxable numeric | integer |  | 054_income_bank_detail.sql |  | New tax regime, FY 2025-26: monthly TDS on a monthly gross (standard deduction 75,000; no tax up to 12 lakh taxable after the rebate; 4% cess). |
| `fn_income_detail_json` | p_app uuid | jsonb | yes | 054_income_bank_detail.sql |  | 6. For staff: the detail, with flags in plain words |
| `fn_income_sim_version` |  | text |  | 054_income_bank_detail.sql |  | Bump on any change to the simulator's logic. |
| `fn_income_summary` | p_app uuid | jsonb | yes | 054_income_bank_detail.sql |  | 3. Summary: the numbers the credit checks use |
| `fn_is_active_staff` |  | boolean |  | 009_rls_policies.sql |  |  |
| `fn_is_customer_application` | p_application uuid | boolean | yes | 050_customer_privacy.sql |  |  |
| `fn_is_practice_user` |  | boolean | yes | 072_practice_roles.sql |  | Is the signed-in person on a practice login? |
| `fn_is_trusted_operator` |  | boolean |  | 018_permission_checks.sql |  | 1. Who is calling |
| `fn_kyc_name_score` | p_app uuid | numeric | yes | 090_kyc_name_fed.sql |  | The weakest PAN / Aadhaar name match against the customer, 0-100; NULL if none read. |
| `fn_lender_code` | p text | character varying | yes | 053_bureau_detail.sql |  | A lender name as a bureau prints it -> our lender code ('~' + key if unknown). |
| `fn_lender_key` | p text | text |  | 053_bureau_detail.sql |  | A lender's name reduced to a key, as the browser engine's normLender does. Postgres regex: \y is a word boundary (\b means backspace). |
| `fn_list_applications` |  | TABLE(application_uuid uuid, application_id character varyin | yes | 068_case_scope_limits_roles.sql |  | B2. Lists follow the case scope |
| `fn_list_applications_page` | p_search text, p_statuses text[], p_sort text, p_desc boolean, p_page integer, p_page_size integer | jsonb | yes | 066_applications_page.sql |  | (engine decisions by case and cases by date are already indexed: idx_engine_decisions_app in 033, idx_applications_created in 001) |
| `fn_loan_dpd_facts` | p_customer_id uuid, p_as_of date | jsonb | yes | 029_loan_repayment_history.sql |  | 4. The facts the credit rules ask for, from that history An installment still unpaid counts as late by however long it has been overdue, so a file that simply s |
| `fn_loan_installment_status` | p_loan_id uuid | TABLE(installment_no smallint, due_date date, amount_due num | yes | 029_loan_repayment_history.sql |  | 3. Each installment, and how late it really was A receipt that names an installment is applied to it — that is how a payer who catches up one month while stayin |
| `fn_loan_irr` | p_loan_id uuid, p_as_of date | numeric | yes | 029_loan_repayment_history.sql |  | 5. What the loan actually earned (IRR) The contract rate is what was agreed; this is what the money really returned, given when each payment arrived. Late payer |
| `fn_loan_status_refresh` | p_limit integer | integer | yes | 062_loan_status_snapshot.sql |  | Bring marked loans up to date, oldest mark first. NULL limit = all of them. Returns how many loans were refreshed. |
| `fn_loan_went_30_late` | p_loan uuid | boolean |  | 093_model_governance.sql |  | "Went 30+ days late in the first 12 EMIs": an instalment due at least 30 days ago with no successful payment within 30 days of its due date. |
| `fn_login_rules` |  | jsonb | yes | 036_roles_and_login_rules.sql |  | Rules any visitor may see, so the sign-in screen can state them. |
| `fn_mark_loan_stale` |  | trigger | yes | 062_loan_status_snapshot.sql |  | Mark the loan whenever its schedule or its payments change. |
| `fn_mask_email` | p_email text | text |  | 046_customer_details_submit.sql |  | "s•••@gmail.com": enough for the owner to recognise, not enough to learn it. |
| `fn_model_comparison` | p_months integer | jsonb | yes | 093_model_governance.sql |  |  |
| `fn_model_controls` |  | jsonb | yes | 093_model_governance.sql |  |  |
| `fn_model_inventory` |  | jsonb | yes | 093_model_governance.sql |  | 4. Inventory and comparison ---------------------------------------------------- |
| `fn_model_version_at` | p_at timestamp with time zone | character varying |  | 030_decision_version_pinning.sql |  |  |
| `fn_months_between` | p_from date, p_to date | integer |  | 053_bureau_detail.sql |  | Whole calendar months from one date to another. |
| `fn_my_account` |  | TABLE(id uuid, email text, full_name text, role text, role_n | yes | 040_my_account.sql |  | table. On the live database that read comes back empty, so the header fell back to a sample name and sign-in routing could not tell staff from customers. This f |
| `fn_my_permissions` |  | jsonb | yes | 067_my_permissions.sql |  | fn_require_permission checks), and whether they may see real customers. A login that is not active staff gets an empty list. It only describes the caller; it gr |
| `fn_officer_decision` | p_application_id text, p_decision text, p_remarks text, p_reason_codes text[], p_sanctioned_amount numeric, p_sanctioned_rate numeric, p_sanctioned_tenure integer, p_override_reason text | jsonb | yes | 018_permission_checks.sql | 089, 095 | 2. Officer decision — permission check, and the real actor on every record Same behaviour as 007, except: the caller needs app.decide, and the audit event and o |
| `fn_org_settings` |  | jsonb | yes | 041_organisation_settings.sql |  | Staff: everything, plus whether this person may change it. |
| `fn_org_settings_save` | p jsonb | void | yes | 041_organisation_settings.sql |  |  |
| `fn_pii_decrypt` | p_cipher bytea | text | yes | 012_pii_encryption.sql |  |  |
| `fn_pii_encrypt` | p_plain text | bytea | yes | 012_pii_encryption.sql |  | 2. Crypto helpers |
| `fn_pii_hash` | p_plain text | text | yes | 012_pii_encryption.sql |  | Deterministic blind index. Case/space normalised so the same PAN always hashes identically. STABLE, not IMMUTABLE: it reads the key out of app_secrets. The uniq |
| `fn_pii_key` |  | text | yes | 091_pii_key_vault.sql |  |  |
| `fn_pii_mask` | p_last4 text, p_width integer | text |  | 012_pii_encryption.sql |  | Mask helper — 'ABCPK1234F' -> 'XXXXXX234F' |
| `fn_policy_activate_due` |  | jsonb | yes | 027_impact_and_activation_fixes.sql |  | 1. Activation: two versions due at the same moment A live window cannot be closed at the instant it opened, so activating a second version with the same start d |
| `fn_policy_approve` | p_version_id uuid, p_effective_from timestamp with time zone, p_comment text | jsonb | yes | 027_impact_and_activation_fixes.sql |  | Say it at approval time too, rather than leaving it for the job to sort out |
| `fn_policy_change_diff` | p_version_id uuid | TABLE(kind text, item text, label text, unit text, before_va | yes | 032_policy_change_history.sql |  | 3. Before and after |
| `fn_policy_document_at` | p_product text, p_at timestamp with time zone, p_tenant_id uuid | TABLE(policy_version_id uuid, version_code character varying |  | 016_versioned_policy.sql |  |  |
| `fn_policy_document_by_id` | p_version_id uuid | TABLE(policy_version_id uuid, version_code character varying |  | 025_policy_impact_check.sql |  | 1b. One version's rules by id (the proposed one, which is not in force yet) |
| `fn_policy_draft_create` | p_version_code character varying, p_rationale text, p_tier character varying, p_product text | jsonb | yes | 024_policy_draft_editing.sql |  | 1. Start a draft from the version in force |
| `fn_policy_draft_discard` | p_version_id uuid | jsonb | yes | 024_policy_draft_editing.sql |  | 3. Discard a draft |
| `fn_policy_draft_set_param` | p_version_id uuid, p_key text, p_value jsonb | jsonb | yes | 024_policy_draft_editing.sql |  | 2. Change one setting on your own draft |
| `fn_policy_facts` | p_limit integer | TABLE(application_id character varying, decided_at timestamp | yes | 028_facts_use_assessed_emi.sql |  | fn_policy_facts also reads the LTV, FOIR and loan amount the assessment settled on, in preference to what was asked for, so the comparison reflects the file as  |
| `fn_policy_facts_for` | p_application_id uuid | TABLE(application_id character varying, decided_at timestamp | yes | 033_server_engine_decisions.sql |  | 1. Facts for one application Same facts as the impact check builds, filtered to one file. Written as a wrapper so there is one definition of a fact, not two. |
| `fn_policy_history` | p_version_id uuid | TABLE(version_id uuid, version_code character varying, at ti | yes | 035_history_order.sql |  | 4. History: one timeline per version, or across all versions |
| `fn_policy_impact` | p_version_id uuid | TABLE(sample_size integer, flips jsonb, summary jsonb, compa | yes | 025_policy_impact_check.sql |  | 3. The latest comparison, for the approval screen (CC3.2) |
| `fn_policy_may_simulate` |  | boolean | yes | 027_impact_and_activation_fixes.sql |  | 4. May this signed-in person ask for an impact check? The engine holds a service key, which passes every check in the database. It therefore has to ask, in the  |
| `fn_policy_param` | p_key text, p_product text, p_at timestamp with time zone, p_tenant_id uuid | jsonb |  | 016_versioned_policy.sql |  |  |
| `fn_policy_pending` |  | TABLE(version_id uuid, version_code character varying, tier  | yes | 023_policy_change_workflow.sql |  | 6. Reading the queue |
| `fn_policy_reject` | p_version_id uuid, p_comment text | jsonb | yes | 023_policy_change_workflow.sql |  | 4. Reject |
| `fn_policy_rule_draft` | p_rule_id text, p_is_active boolean, p_threshold text, p_severity text | jsonb | yes | 074_policy_rule_changes.sql |  | Put a rule change on the author's open draft (starting one if needed). |
| `fn_policy_rule_draft_remove` | p_rule_id text | jsonb | yes | 074_policy_rule_changes.sql |  |  |
| `fn_policy_rule_lines` | p_version_id uuid | TABLE(rule_id text, line text) |  | 032_policy_change_history.sql |  | 2. The rules in a version, one line each Reads the decision tables in the rules document and writes each rule as the conditions that make it fire, e.g. "FOIR_LI |
| `fn_policy_settings` | p_version_id uuid | TABLE(param_key character varying, label character varying,  | yes | 024_policy_draft_editing.sql |  | 4. Read a version's settings, with what each one is allowed to be |
| `fn_policy_simulation_record` | p_version_id uuid, p_compared_to uuid, p_sample_size integer, p_flips jsonb, p_summary jsonb | uuid | yes | 027_impact_and_activation_fixes.sql |  | 3. Impact figures come from the engine, not from a person The numbers an approver reads decide whether a change is safe. Written by hand through the API they wo |
| `fn_policy_submit` | p_version_id uuid, p_title character varying, p_summary text | jsonb | yes | 023_policy_change_workflow.sql |  | 1. Propose |
| `fn_policy_version_at` | p_product text, p_at timestamp with time zone, p_tenant_id uuid | uuid |  | 016_versioned_policy.sql |  | 5. Read functions (FD1.4) |
| `fn_policy_withdraw` | p_version_id uuid, p_reason text | jsonb | yes | 023_policy_change_workflow.sql |  | 2. Withdraw (back to the author's desk) |
| `fn_practice_reset` |  | jsonb | yes | 073_practice_reset.sql |  | (G7) once switched on. Website and service logins cannot call it. SELECT fn_practice_reset(); Run order: after 072. Safe to re-run (a second reset finds nothing |
| `fn_practice_snapshot` | p_application uuid | void | yes | 072_practice_roles.sql |  |  |
| `fn_product_key` | p text | text |  | 053_bureau_detail.sql |  | A bureau's product name reduced to a key. |
| `fn_public_org_info` |  | jsonb | yes | 041_organisation_settings.sql |  | Anyone, signed in or not: what the footer and legal page show. |
| `fn_rate_grid_activate_due` |  | integer | yes | 071_rate_grid_versions.sql |  | Approved grids whose date has come go live; the one before is kept as history. For the engine's product the figures are written into the engine's tables. |
| `fn_rate_grid_decide` | p_version uuid, p_approve boolean, p_note text | jsonb | yes | 071_rate_grid_versions.sql |  | Approve or reject: pricing.approve, and never the author. |
| `fn_rate_grid_draft_create` | p_product text, p_rationale text | jsonb | yes | 071_rate_grid_versions.sql |  | Start a draft: a copy of the grid in force, or of the car grid for a new product. |
| `fn_rate_grid_draft_save` | p_version uuid, p_bands jsonb, p_categories jsonb, p_rationale text | jsonb | yes | 071_rate_grid_versions.sql |  | Replace the draft's bands and categories (the author only, while a draft). |
| `fn_rate_grid_json` | p_version uuid | jsonb | yes | 071_rate_grid_versions.sql |  | Internal: the grid as JSON; checks on a grid; going live |
| `fn_rate_grid_overview` | p_product text | jsonb | yes | 071_rate_grid_versions.sql |  | Everything the page shows for one product: products, the grid in force, the open draft or request, history, and what this person may do. |
| `fn_rate_grid_problems` | p_version uuid | text[] | yes | 071_rate_grid_versions.sql |  | What is wrong with a grid, in words; empty when it can go for approval. |
| `fn_rate_grid_product_create` | p_code text, p_name text, p_description text | jsonb | yes | 071_rate_grid_versions.sql |  | A new product or segment (it gets a blank draft grid to fill in). |
| `fn_rate_grid_submit` | p_version uuid, p_effective_from date, p_rationale text | jsonb | yes | 071_rate_grid_versions.sql |  | Send for approval with the date it should start; withdraw back to a draft; discard a draft. |
| `fn_rate_grid_version_at` | p_product text, p_at timestamp with time zone | jsonb | yes | 071_rate_grid_versions.sql |  | Which grid was in force for a product at a time (e.g. when a case was assessed). |
| `fn_rate_grid_withdraw` | p_version uuid, p_discard boolean | jsonb | yes | 071_rate_grid_versions.sql |  |  |
| `fn_reading_summary` | p_app uuid | jsonb | yes | 054_income_bank_detail.sql |  | 052's reading summary, now preferring the detail tables part by part. |
| `fn_record_document_reading` | p_application_id text, p_reader_type text, p_fields jsonb | jsonb | yes | 052_auto_document_checks.sql |  | The readers call this after each document (service key only): R20. |
| `fn_record_face_match` | p_application_id text, p_doc_type text, p_side text, p_similarity numeric, p_result text | void | yes | 052_auto_document_checks.sql |  | 046's face match record, now also re-running the checks. |
| `fn_record_failed_login` | p_email text | void | yes | 072_practice_roles.sql |  | Lockout skips public-demo and practice accounts (their passwords are public); otherwise as 042. |
| `fn_record_income_detail` | p_application_id text, p_kind text, p jsonb | jsonb | yes | 054_income_bank_detail.sql |  | 5. Writer for the document readers (service key only) p_kind SALARY_SLIP / FORM16 / BANK_MONTH; p holds the table's columns by name. One row is replaced (same m |
| `fn_record_login` |  | jsonb | yes | 036_roles_and_login_rules.sql |  | Called right after a successful sign-in. Tells the screen whether to carry on and which rules apply to this person; clears the failed-attempt count. |
| `fn_record_model_scores` | p_application text, p_scores jsonb | integer | yes | 093_model_governance.sql |  | Called by the case screen after it scores a case (p_application = the application number). p_scores: [{model_version, probability, grade, shown}] |
| `fn_require_any_permission` | p_permissions text[] | uuid | yes | 036_roles_and_login_rules.sql |  | Returns the calling user's users.id, or NULL for a trusted operator. Raises if nobody is logged in, the login has no active cercit user, or the user's role lack |
| `fn_require_permission` | p_permission text | uuid |  | 018_permission_checks.sql |  |  |
| `fn_retention_due` |  | TABLE(customer_id uuid, reason text, since date) | yes | 080_data_erasure.sql |  | Customers whose data is past the retention period: ids and dates only |
| `fn_role_permissions` | p_role text | text[] | yes | 036_roles_and_login_rules.sql |  | 5. Permission checks read the tables, and refuse locked accounts |
| `fn_role_request_decide` | p_request_id uuid, p_approve boolean, p_note text | void | yes | 039_role_change_approval.sql |  |  |
| `fn_role_request_submit` | p_role_code text, p_name text, p_description text, p_permissions text[], p_mfa_required boolean, p_idle_timeout_minutes integer, p_is_active boolean, p_reason text | uuid | yes | 039_role_change_approval.sql |  |  |
| `fn_role_request_withdraw` | p_request_id uuid | void | yes | 039_role_change_approval.sql |  |  |
| `fn_roles_overview` |  | jsonb | yes | 039_role_change_approval.sql |  | What the Roles screen shows. Anyone with role.manage, role.approve or user.view may look; the flags say which buttons to show. |
| `fn_rule_set_snapshot` |  | character varying | yes | 030_decision_version_pinning.sql |  | Captures the active policy_rules rows, keeps a copy the first time this exact set is seen, and returns its fingerprint. Only the columns that change an outcome  |
| `fn_run_policy_engine` | p_application_id uuid | jsonb | yes | 070_employer_category_pricing.sql | 088, 090 | The rules (fn_run_policy_engine, last defined in 053), unchanged but for the EMI they check FOIR with: now at the loaded rate. |
| `fn_security_setting` | p_key text | integer | yes | 036_roles_and_login_rules.sql |  | Values are left alone on re-run. |
| `fn_sees_real_customers` |  | boolean | yes | 050_customer_privacy.sql |  | * restrictive row policies on every table holding customer-journey data * the staff read functions that bypass row security check it too * the old Applications  |
| `fn_set_model_scores_shown` | p_on boolean, p_reason text | jsonb | yes | 093_model_governance.sql |  |  |
| `fn_settings_backup_latest` |  | jsonb | yes | 079_settings_backup.sql |  | The newest backup, whole: for the export script (service key) and the SQL editor |
| `fn_settings_backup_tables` |  | text[] |  | 079_settings_backup.sql |  |  |
| `fn_settings_backup_take` | p_kind text | jsonb | yes | 079_settings_backup.sql |  |  |
| `fn_settings_baseline_save` | p_name text | jsonb | yes | 076_settings_defaults.sql |  |  |
| `fn_settings_baselines` |  | jsonb | yes | 076_settings_defaults.sql |  | Admin: list the baselines. |
| `fn_settings_capture` |  | jsonb | yes | 076_settings_defaults.sql |  | Every setting, flat: "area\|item" -> value. Flat keys make the comparison a join. |
| `fn_settings_diff` | p_baseline uuid | TABLE(area text, item text, now_value jsonb, default_value j | yes | 076_settings_defaults.sql |  | What a reset would change: area, item, now, default, and how it is put back. |
| `fn_settings_reset` | p_baseline uuid, p_confirm text | jsonb | yes | 076_settings_defaults.sql |  | The reset itself. |
| `fn_settings_reset_preview` | p_baseline uuid | jsonb | yes | 076_settings_defaults.sql |  |  |
| `fn_shortfall_tolerance` |  | numeric |  | 029_loan_repayment_history.sql |  | 2. How much of a shortfall is not a delay |
| `fn_sim_bytes` | p_base text, p_tag text | integer[] |  | 053_bureau_detail.sql |  | 16 deterministic bytes b[1..16] for one customer and one tag. |
| `fn_sim_daily` | p_day date, p_replay boolean | jsonb | yes | 075_daily_simulation.sql |  | 4. The daily run |
| `fn_sim_disburse_day` | p_day date | integer | yes | 075_daily_simulation.sql |  | 2. Disburse the day's approved synthetic cases (056's schedule, no seasoning) |
| `fn_sim_leads` | p_day date, p_count integer | jsonb | yes | 075_daily_simulation.sql |  | 1. Leads: the generator's day batch, dated that day Day batches start at 201 (case numbers from SYN0002001), clear of the eight starting batches of 250. Day 0 i |
| `fn_sim_payments_day` | p_day date | jsonb | yes | 075_daily_simulation.sql |  | 3. The day's payments, cures and closures |
| `fn_sim_recent_days` | p_days integer | jsonb | yes | 075_daily_simulation.sql |  | The day's summaries for the dashboard and reports (staff who see the book). |
| `fn_simulate_income_detail` | p_app uuid, p_as_of date | jsonb | yes | 054_income_bank_detail.sql |  |  |
| `fn_simulated_bureau` | p_customer uuid | jsonb | yes | 053_bureau_detail.sql |  | 048's preview, now two bureaus. Same signature and keys: the flat v1 keys come from COMBINED, plus version, score_source and the per-bureau scores. Writes nothi |
| `fn_staff_after_approval` | p_application_id text | jsonb | yes | 050_customer_privacy.sql |  |  |
| `fn_staff_application_review` | p_application_id text | jsonb | yes | 061_staff_application_review.sql |  |  |
| `fn_staff_auto_rules` |  | jsonb | yes | 052_auto_document_checks.sql |  |  |
| `fn_staff_bureau_detail` | p_application_id text | jsonb | yes | 053_bureau_detail.sql |  | The officer's screen: both bureaus side by side for one application. Not limited to customer applications; real customers need pii.reveal (050). |
| `fn_staff_case_employer` | p_application_id text | jsonb | yes | 071_rate_grid_versions.sql |  | The officer's employer card also names the grid in force when the case was assessed (070's function, with that one key added). |
| `fn_staff_case_scope` | OUT sees_all boolean, OUT me uuid, OUT unassigned boolean | record | yes | 061_staff_application_review.sql |  |  |
| `fn_staff_customer_action` | p_application_id text, p_action text, p jsonb | jsonb | yes | 049_after_approval.sql |  | ACCEPT_DOC   {doc_type}              the file is fine REQUEST_DOC  {doc_type, reason}      ask the customer again (they see the reason) DOCS_VERIFIED            |
| `fn_staff_customer_case` | p_application_id text | jsonb | yes | 050_customer_privacy.sql |  | 4. One case, everything the officer needs |
| `fn_staff_customer_checks` | p_application_id text | jsonb | yes | 050_customer_privacy.sql |  | 4. The case view shows the checks; approving needs them |
| `fn_staff_customer_decide_guard` |  | trigger | yes | 048_customer_credit_checks.sql |  | Approving without the credit checks is refused. Checked before the 047 action runs. |
| `fn_staff_customer_queue` | p_scope text | jsonb | yes | 068_case_scope_limits_roles.sql |  | 050's queue, plus what the automatic checks did on each case. |
| `fn_staff_customer_run_checks` | p_application_id text, p_read jsonb | jsonb | yes | 052_auto_document_checks.sql |  | 3. Run the credit checks p_read: what the document readers found, from the officer's screen: {"slip_net_salary": 85400, "form16_annual": 1150000, "bank": {"avg_ |
| `fn_staff_dashboard` | p_from timestamp with time zone | jsonb | yes | 064_staff_dashboard.sql |  | (fn_sees_real_customers), so the public demo login gets staff and synthetic cases only. Synthetic cases are counted (they are the simulated book the demo runs o |
| `fn_staff_disburse` | p_application_id text, p jsonb | jsonb | yes | 049_after_approval.sql |  | 6. The officer disburses |
| `fn_staff_document_checks` | p_application_id text | jsonb | yes | 052_auto_document_checks.sql |  | 7. For staff: what the checks said, run them again, change the rules |
| `fn_staff_frame_summary` |  | jsonb | yes | 068_case_scope_limits_roles.sql |  | staff-login changes only for people who may view users. Real customers' cases count only for staff who may see real customers (fn_sees_real_customers), so the p |
| `fn_staff_income_detail` | p_application_id text | jsonb | yes | 054_income_bank_detail.sql |  |  |
| `fn_staff_issue_offer` | p_application_id text, p jsonb | jsonb | yes | 049_after_approval.sql |  | 4. The officer issues the offer |
| `fn_staff_loan_portfolio` | p_as_of date | jsonb | yes | 062_loan_status_snapshot.sql |  | 058's function, reading the snapshot. Same keys, plus stale_loans. |
| `fn_staff_policy_rules` |  | jsonb | yes | 074_policy_rule_changes.sql |  | 063's reader, with the drafts, approvals and rights around the rules. |
| `fn_staff_rerun_document_checks` | p_application_id text | jsonb | yes | 052_auto_document_checks.sql |  |  |
| `fn_staff_risk_features` | p_application_id text | jsonb | yes | 077_risk_features.sql |  | It also says, for each input, whether it came from the detail or fell back to the training default (detail missing), so the screen can say so. Same visibility a |
| `fn_staff_set_auto_rule` | p jsonb | jsonb | yes | 052_auto_document_checks.sql |  | p: {settings: {enabled, auto_accept, auto_verify, auto_credit_checks, reader_wait_minutes}} or {doc_type, auto_accept} or {doc_type, check, enabled, blocking, t |
| `fn_submit_full_application` | p_full_name text, p_email text, p_mobile text, p_dob date, p_pan text, p_employer text, p_city text, p_state_code text, p_pincode text, p_net_salary numeric, p_existing_emis numeric, p_loan_amount numeric, p_tenure integer, p_make text, p_model text, p_variant text, p_fuel_type text, p_ex_showroom numeric, p_on_road numeric, p_cibil_score integer | jsonb | yes | 019_submit_application_permission.sql |  | Same function as 006 with one change at the top: the caller needs app.create (or is a trusted operator, see 018). Execution is closed to callers who are not log |
| `fn_synthetic_cars` |  | TABLE(make text, model text, variant text, fuel text, ex_sho |  | 055_synthetic_customers.sql |  | Cars people actually finance, with ex-showroom prices (Rs, Oct 2026, approx). |
| `fn_synthetic_disburse` | p_limit integer | jsonb | yes | 056_synthetic_loans.sql |  | Run in the SQL Editor after 055, then: SELECT fn_synthetic_disburse(300);   -- repeat until it says "disbursed": 0 fn_synthetic_purge (055) also removes these l |
| `fn_synthetic_generate` | p_batch integer, p_size integer | jsonb | yes | 055_synthetic_customers.sql |  |  |
| `fn_synthetic_purge` |  | jsonb | yes | 056_synthetic_loans.sql |  | 055's purge, extended: loans hang off applications through loan_accounts, and their schedules and payments hang off the loan. |
| `fn_synthetic_version` |  | text |  | 055_synthetic_customers.sql |  | 2. The generator |
| `fn_team_actor` |  | uuid | yes | 085_team_reset.sql |  | The signed-in team login, or NULL for anyone else |
| `fn_team_ids` |  | uuid[] | yes | 085_team_reset.sql |  |  |
| `fn_team_pending` |  | jsonb | yes | 085_team_reset.sql |  | What would be undone |
| `fn_team_reset` |  | jsonb | yes | 085_team_reset.sql |  | Undo it |
| `fn_tenure_cap` | p_govt_employee boolean, p_on_road_price numeric, p_band_cap integer, p_band_label text | TABLE(cap integer, source text) |  | 031_foir_ltv_tenure_basis.sql |  | 1. Tenure cap Product limits come from the policy version in force once one carries them; until then, the values in the 2026.08 and 2026.09 rules. |
| `fn_unlock_user` | p_user_id uuid | void | yes | 036_roles_and_login_rules.sql |  |  |
| `fn_upsert_customer_address` | p_customer uuid, p_type text, p jsonb, p_source text, p_rented boolean, p_residence text, p_owner text, p_owner_mobile text, p_years smallint | void |  | 046_customer_details_submit.sql |  |  |
| `set_updated_at` |  | trigger |  | 001_schema.sql |  |  |
| `trg_auto_review_on_reupload` |  | trigger | yes | 052_auto_document_checks.sql |  |  |
| `trg_auto_review_on_submit` |  | trigger | yes | 052_auto_document_checks.sql |  | On submit (the RECEIVED step) and on every file a submitted customer sends again. |
| `trg_customers_encrypt_pii` |  | trigger | yes | 046_customer_details_submit.sql |  | 2. Mobile blind index (same scheme as PAN in 012) |
| `trg_decision_version_stamp` |  | trigger | yes | 030_decision_version_pinning.sql |  | 5. Stamping at decision time |
| `trg_detail_groups_emis` |  | trigger | yes | 048_customer_credit_checks.sql |  | 1. Existing EMIs from step 4 |
| `trg_feature_flags_history` |  | trigger | yes | 015_tenants_and_feature_flags.sql |  | SECURITY DEFINER: the history table has no insert policy, so the trigger writes with the owner's rights regardless of who changed the switch. |
| `trg_link_auth_user` |  | trigger | yes | 034_demo_users.sql |  |  |
| `trg_policy_change_reviews_four_eyes` |  | trigger |  | 016_versioned_policy.sql |  | A reviewer can never be the author of the version under review |
| `trg_policy_content_guard` |  | trigger |  | 016_versioned_policy.sql |  |  |
| `trg_policy_parameters_validate` |  | trigger |  | 016_versioned_policy.sql |  | Parameter values must fit their definition |
| `trg_policy_version_apply_rules` |  | trigger | yes | 074_policy_rule_changes.sql |  | When a version goes live, its rule changes reach the rules the engine checks. |
| `trg_policy_version_events` |  | trigger | yes | 032_policy_change_history.sql |  |  |
| `trg_policy_versions_guard` |  | trigger |  | 016_versioned_policy.sql |  | Guards 2 and 6: allowed status moves, frozen fields once submitted, no deletes |
| `trg_practice_keeps_role` |  | trigger |  | 072_practice_roles.sql |  | Practice accounts keep their practice role. |
| `trg_practice_policy_stays_draft` |  | trigger | yes | 072_practice_roles.sql |  | A practice login's policy draft can be edited, simulated and cancelled, never sent for approval, approved or made live. |
| `trg_practice_role_rights` |  | trigger |  | 072_practice_roles.sql |  | Only these rights may ever sit on a practice role. |
| `trg_practice_synthetic_only` |  | trigger | yes | 072_practice_roles.sql |  | One guard for every table a case change touches: a practice login may only change synthetic cases, and the first change keeps a snapshot. |
| `trg_public_demo_keeps_role` |  | trigger |  | 042_public_demo_account.sql |  | The demo login's password is public, so its role can never be swapped for a stronger one: that would hand those rights to every visitor. |
| `trg_public_demo_read_only` |  | trigger |  | 042_public_demo_account.sql |  | Only view rights may ever sit on a public-demo role. |
| `trg_requirements_mark_customer` |  | trigger | yes | 047_staff_customer_cases.sql |  |  |
| `trg_role_permission_conflict` |  | trigger |  | 036_roles_and_login_rules.sql |  |  |
| `trg_team_journal` |  | trigger | yes | 085_team_reset.sql |  | Trigger: TG_ARGV holds the table's key columns |
| `trg_users_email_domain` |  | trigger | yes | 041_organisation_settings.sql |  | Staff email domains, enforced on every write to users |

View: `v_role_conflicts`.