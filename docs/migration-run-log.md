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
| 024 | `024_policy_draft_editing.sql` | ☐ | Start a draft from the version in force, change its settings, discard it; read a version's settings with their limits |
| 025 | `025_policy_impact_check.sql` | ✅ 18 Sep 2026 | Hands recent applications to the rules engine so a proposed change can be run beside the live one, and keeps the result |
| 026 | `026_policy_facts_keep_nulls.sql` | ✅ 18 Sep 2026 | Keeps unknown facts present as null, so an application with a missing figure is still checked |
| 027 | `027_impact_and_activation_fixes.sql` | ✅ 18 Sep 2026 | Review fixes: two changes due at once no longer jam activation; facts say "not known" instead of guessing; impact figures can only be written by the rules engine |
| 028 | `028_facts_use_assessed_emi.sql` | ✅ 18 Sep 2026 | The impact check uses the EMI, amount and tenure the assessment settled on, so the affordability rules are actually exercised |
| 029 | `029_loan_repayment_history.sql` | ✅ 19 Sep 2026 | Loans, their installment schedule and every payment attempt; works out how late each installment really was, and the realised return (IRR) |
| 030 | `030_decision_version_pinning.sql` | ✅ 19 Sep 2026 | Every recommendation and decision records the policy version, the exact rule set and the model version it was made under; older rows are marked 2026.08 (assumed) |
| 031 | `031_foir_ltv_tenure_basis.sql` | ✅ 19 Sep 2026 | FOIR on net salary plus other income (as the rules use); summary names ex-showroom and on-road LTV; tenure capped at the tightest of product and band limits, and a cut that pushes FOIR over the cap goes to review |
| 032 | `032_policy_change_history.sql` | ✅ 19 Sep 2026 | Every status change on a policy version is recorded with who made it; before/after list of changed settings and rules; one history timeline per version. Older versions get history rebuilt from their dates, marked as rebuilt |
| 020 | `020_lock_policy_tables.sql` | ⏸ held | Makes the policy tables read-only through the API. This switches off the toggles on the Policy Rules screen, so it waits until Credit control (CC2.1) replaces them |

010 was run earlier, when the demo accounts were created.

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


