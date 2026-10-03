# Migration run log

Which database migrations have been run on the live Supabase project, in what
order, and what to watch for. Tick a line only after the SQL Editor reports
success. Migrations are run by hand, one file at a time, by Sameer.

Order matters: each file assumes the ones above it are already in.

| # | File | Run | What it does |
|---|---|---|---|
| 009 | `009_rls_policies.sql` | ✅ 17 Sep 2026 | Only signed-in staff can read loan data; nobody can edit their own user record; audit notes are written in the writer's own name |
| 011 | `011_employer_category_pricing.sql` | ✅ 17 Sep 2026 | Employer categories as the second pricing axis beside the rate grid |
| 012 | `012_pii_encryption.sql` | ✅ 17 Sep 2026 | PAN and mobile encrypted at rest, searchable by blind index, shown masked; reveals are audited |
| 013 | `013_pii_enforce_no_plaintext.sql` | ✅ 17 Sep 2026 | Blocks any future plain-text PAN or mobile |
| 014 | `014_customer_employment_fields.sql` | ✅ 17 Sep 2026 | Employment fields the assessment needs |
| 015 | `015_tenants_and_feature_flags.sql` | ✅ 17 Sep 2026 | Tenants and the module switches (all off) |
| 016 | `016_versioned_policy.sql` | ✅ 17 Sep 2026 | Versioned, approved credit policy with its guard rules |
| 017 | `017_seed_policy_2026_08.sql` | ✅ 17 Sep 2026 | Today's rules stored as the active baseline, version 2026.08 |
| 018 | `018_permission_checks.sql` | ✅ 17 Sep 2026 | Permission checks in the database, not just the screens |
| 019 | `019_submit_application_permission.sql` | ✅ 17 Sep 2026 | Submitting an application needs the right to create one |
| 022 | `022_service_role_policy_read.sql` | ✅ 17 Sep 2026 | Lets the AWS rules engine read the policy in force; no write rights |
| 021 | `021_draft_policy_2026_09.sql` | ✅ 17 Sep 2026 | The unified rules stored as draft 2026.09 (not live until approved) |
| 023 | `023_policy_change_workflow.sql` | ✅ 18 Sep 2026 | Propose, withdraw, approve, reject a policy change, and the job that makes an approved version live on its date |
| 024 | `024_policy_draft_editing.sql` | ☑ run 2 Oct (late; was missing); checked: functions exist (42501 to the public key) | Start a draft from the version in force, change its settings, discard it; read a version's settings with their limits |
| 025 | `025_policy_impact_check.sql` | ✅ 18 Sep 2026 | Hands recent applications to the rules engine so a proposed change can be run beside the live one, and keeps the result |
| 026 | `026_policy_facts_keep_nulls.sql` | ✅ 18 Sep 2026 | Keeps unknown facts present as null, so an application with a missing figure is still checked |
| 027 | `027_impact_and_activation_fixes.sql` | ✅ 18 Sep 2026 | Review fixes: two changes due at once no longer jam activation; facts say "not known" instead of guessing; impact figures can only be written by the rules engine |
| 028 | `028_facts_use_assessed_emi.sql` | ✅ 18 Sep 2026 | The impact check uses the EMI, amount and tenure the assessment settled on, so the affordability rules are actually exercised |
| 029 | `029_loan_repayment_history.sql` | ✅ 19 Sep 2026 | Loans, their installment schedule and every payment attempt; works out how late each installment really was, and the realised return (IRR) |
| 030 | `030_decision_version_pinning.sql` | ✅ 19 Sep 2026 | Every recommendation and decision records the policy version, the exact rule set and the model version it was made under; older rows are marked 2026.08 (assumed) |
| 031 | `031_foir_ltv_tenure_basis.sql` | ✅ 19 Sep 2026 | FOIR on net salary plus other income (as the rules use); summary names ex-showroom and on-road LTV; tenure capped at the tightest of product and band limits, and a cut that pushes FOIR over the cap goes to review |
| 032 | `032_policy_change_history.sql` | ✅ 19 Sep 2026 | Every status change on a policy version is recorded with who made it; before/after list of changed settings and rules; one history timeline per version. Older versions get history rebuilt from their dates, marked as rebuilt |
| 033 | `033_server_engine_decisions.sql` | ✅ 20 Sep 2026 | The AWS rules engine can decide one application: facts for a single case, a record of every answer it gives, and — once the `server_engine` switch is on — that answer becomes the case's decision |
| 034 | `034_demo_users.sql` | ✅ 21 Sep 2026 | Three demo accounts with their roles: demo1 (credit officer), demo2 (credit manager), demo_admin (admin). No passwords here; a login created in Supabase links itself to its role row by email |
| 035 | `035_history_order.sql` | ✅ 21 Sep 2026 | Policy history keeps the order things happened in, even when two steps land in the same instant |
| 053 | `053_bureau_detail.sql` | ✔ run 1 Oct 2026 (checked live) | Two bureaus per credit check (CIBIL plus one other), with every account, a 24-month late-payment grid and every enquiry; the same loan on both is matched through lender names and counted once; bad marks take the worse of the two; monthly obligation is EMIs plus 5% of card and overdraft balances. The engine still reads one row per application, still named CIBIL-SIMULATED; older reports and their decisions are kept. Also fixes the engine for a customer with no record at either bureau: it used to stop with an error, now the case goes to a person (D6). Run after 052, and again after any re-run of 004, 031, 048 or 052. Afterwards check: 13 lenders, 38 lender names, 20 product names, and no application with two bureau_reports rows. See "053 notes" below |
| 054 | `054_income_bank_detail.sql` | ✔ run 2 Oct 2026 (checked live) | Salary slips (3 months), Form 16 Part B, bank month-by-month summary; credit checks read them when present; simulation for synthetic customers; officer Income and bank card. Run after 053 |
| 055 | `055_synthetic_customers.sql` | ✔ run 2 Oct 2026; 8 batches = 2,000 customers (checked: 0 errors, 45 MB) | The 2,000-customer generator (functions only) plus an income-check fix: Form 16 is gross pay, so it is no longer compared with take-home pay. Then run `SELECT fn_synthetic_generate(1, 250);` to `(8, 250)` one at a time. Remove everything synthetic with `SELECT fn_synthetic_purge();`. Re-run 055 after any re-run of 048, 052 or 053 |
| 056 | `056_synthetic_loans.sql` | ☑ run 2 Oct (628 loans; disburse returned 0) | Disburses approved (final) synthetic applications 3-27 months back, with schedules and every payment attempt: ~3% of debits bounce and clear days later, ~2.5% of loans have a 31-60 day stretch, ~0.5% stop paying; weaker profiles about 3x. Then `SELECT fn_synthetic_disburse(300);` until it returns 0. Purge (055) now removes the loans too |
| 057 | `057_risk_model_v2.sql` | ☑ run 2 Oct, 12:39 IST; checked: v1 RETIRED, v2 ACTIVE | Retires risk model v1 and makes v2 the active model from the moment it runs, so new decisions record cercit-risk-v2. The app switched to v2 in the same push. Check: `select model_version, status, effective_to from model_versions;` shows v1 RETIRED with an end time, v2 ACTIVE |
| 058 | `058_loan_portfolio.sql` | ☑ run 2 Oct; checked: function exists (42501 to the public key) | One read-only function, `fn_staff_loan_portfolio`, for the new Loan portfolio page: days-overdue buckets, PAR 30, bounces by month, vintages, late rate by score band and recommendation, most overdue loans. Credit managers, heads, compliance and admins; the demo login sees synthetic loans only. Check: the Loan portfolio page loads for an admin |
| 059 | `059_customer_apps_in_list.sql` | ☑ run 2 Oct; checked: fn_list_applications returns the new origin column | R22: customer applications back in the older Applications list for staff who may see real customers (not the demo login), filled in from the quotation, drafts left out, one row per application. Drops and recreates fn_list_applications (new origin column). Check: Applications shows customer cases with a Customer tag that open their own screen |
| 060 | `060_staff_frame_summary.sql` | ☑ run 3 Oct; checked as admin: 1 case waiting, 12 recent events | Fixes A1/A2: one read-only function, `fn_staff_frame_summary`, for the Applications badge (real cases waiting) and the bell (latest real events). Check: the badge shows a number (or nothing if 0) and the bell lists recent events |
| 061 | `061_staff_application_review.sql` | ☐ not yet run | Fixes C5: one read-only function, `fn_staff_application_review`, gives the Application Review page the case (PAN and mobile masked), its bureau summary, bank summary and transactions, timeline and possible duplicates. Same privacy rule as the list: the demo login can't open real customers' cases. Check: an application opens for an admin, with Bureau, Banking and Timeline tabs filled |
| 062 | `062_loan_status_snapshot.sql` | ☐ not yet run | Fixes C6: the Loan portfolio page and the dashboard's Portfolio quality box read a stored status per instalment (`loan_status_snapshot`) instead of replaying every loan's payments on each visit. A payment marks its loan for refresh; the page refreshes up to 200 marked loans per visit. The first run fills the whole book (a few seconds). Check: `select count(*) from loan_status_stale` is 0, and the Loan portfolio page opens for an admin |
| 063 | `063_staff_policy_rules.sql` | ☐ not yet run | Fixes C7: one read-only function, `fn_staff_policy_rules`, gives the Policy Rules page the real credit rules the engine checks, the version in force and the last change with who made it. Any signed-in staff member may read it. Check: Policy Rules shows Minimum CIBIL score 650, not the sample 750 |
| 064 | `064_staff_dashboard.sql` | ☐ not yet run | Fixes C10: one function, `fn_staff_dashboard`, gives the dashboard every figure: totals and trend against the period before, straight-through share, funnel, decision trend, first-payment default (from 062), my queue, referred cases with the rules not met, and recent activity. Demo login: no real customers. Needs 062. Check: the dashboard shows non-zero totals for an admin |
| 065 | `065_audit_log.sql` | ☐ not yet run | Fixes C1 and G6: `fn_audit_log` gives one combined log (case events, policy versions, module switches, case stages, overrides), newest first, in pages of 50, with date, user, activity, case and text filters. audit.view only; real customers only for staff who may see them. Also makes audit_events read only for website and service logins (no change or delete). Check: the Audit Log page lists entries for an admin |
| 066 | `066_applications_page.sql` | ☐ not yet run | Fixes C4: `fn_list_applications_page` gives the Applications page 50 cases at a time, searched (case number, name, employer, last 4 or whole PAN), filtered and sorted in the database, with the server engine's decision on each row. Adds five indexes. Same privacy rule as the full list. Check: Applications opens quickly and shows page 1 of about 41 |
| 067 | `067_my_permissions.sql` | ☐ not yet run | B1/B3: `fn_my_permissions` tells the site the signed-in person's role and rights, so the menu and buttons follow them. Read only; grants nothing. Check: an officer's menu has no Users, Roles, Organisation, Audit Log or Approvals |
| 068 | `068_case_scope_limits_roles.sql` | ☐ not yet run | B2: officers see their own cases plus unassigned ones in the Applications list, the customer queue and the badge (setting officers_see_unassigned, default 1). B5: the daily case limit and sanction limit on a user are enforced on every officer decision. C3: the old ADMIN, CREDIT_OFFICER and STATE_HEAD roles are removed (or marked retired if a login holds one). Needs 061. Check: an officer's Applications list hides cases assigned to another officer |
| 020 | `020_lock_policy_tables.sql` | ⏸ held | Makes the policy tables read-only through the API. This switches off the toggles on the Policy Rules screen, so it waits until Credit control (CC2.1) replaces them |

010 was run earlier, when the demo accounts were created.

## 053 notes

- **Generator batch size.** Locally, a batch of 500 synthetic applications took
  about 45 seconds for the bureau pull step alone. Supabase's Postgres is faster
  than the local test database, but if the SQL Editor times out, run the
  generator in batches of 250.
- **Database versions.** The local test database is PostgreSQL 18 (PGlite);
  Supabase runs 15 or 17. 053 is written to avoid anything newer than 15, but
  it has only been run on 18, so a difference would show up only on Supabase:
  read the SQL Editor's output rather than assuming a local pass carries over.
- **Engine functions.** 053 redefines `fn_run_policy_engine` (from 004) and
  `fn_generate_recommendation` (from 031) to stop the no-record crash.
  Re-running 004 or 031 afterwards brings the crash back; run 053 again after
  them.

## The encryption key (012)

012 generates a random key and stores it in `app_secrets`. The database uses it
by itself; nobody types it. It is not anyone's password, and it is never written
into a file in this repository, which is public.

Read it back with:

```sql
select value from app_secrets where name = 'pii_key';
```

If the key is lost, the encrypted PAN and mobile numbers cannot be read again.
Keep a spare copy somewhere private, such as a password manager. Never paste it
into a message, an email or a website. To change the key later, the data has to
be read with the old key and written back with the new one in a single step.

**Checked on the live system, 17 Sep 2026:** 2026.08 active and 2026.09 held as a draft; all ten module switches off; the AWS engine answers from the database and names the version it used.

## After the migrations

- The rules engine on AWS (`POST /prod/evaluate`) starts answering once 016 and
  017 are in; before that it reports that it cannot find a policy version.
- The module switches stay off until each module is ready, so the running site
  behaves as it does today.
- Draft policy 2026.09 changes nothing for applicants until someone other than
  its author approves it.

## If something fails

Stop and report the red error text rather than re-running the rest. Every file
is safe to run twice, so a fixed file can simply be run again.


