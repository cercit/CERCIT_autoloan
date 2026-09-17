# cercit SQL scripts

Run these in order in the Supabase SQL Editor to set up a fresh instance.

| # | File | What it does |
|---|---|---|
| 001 | `001_schema.sql` | 22-table schema (applications, customers, bureau, decisions, audit, etc.) |
| 002 | `002_seed_lookups.sql` | Employer tiers, vehicle makes, state codes, policy rule defaults |
| 003 | `003_seed_dealers.sql` | 132 dealers across 12 OEMs |
| 004 | `004_functions.sql` | 8 PostgreSQL functions (policy engine, EMI calc, assessment pipeline, dashboard) |
| 005 | `005_smoke_tests.sql` | Verify functions return expected results |
| 006 | `006_submit_application.sql` | `fn_submit_full_application` — single call that creates customer + application + runs pipeline |
| 007 | `007_officer_decision.sql` | `fn_officer_decision` — approve/reject/refer with override logging |
| 008 | `008_demo_scenarios.sql` | 3 test applications: Approve (CIBIL 780), Reject (CIBIL 580), Maybe (CIBIL 680) |
| 009 | `009_rls_policies.sql` | Row-level security per role |
| 010 | `010_seed_auth_users.sql` | Demo user accounts (manual step: create in Supabase Auth dashboard first) |
| 011 | `011_employer_category_pricing.sql` | Employer category pricing (A/B/C loadings, LTV, tenure, fee) for the rate grid page |
| 012 | `012_pii_encryption.sql` | Encrypts PAN + mobile at rest (pgcrypto). **Set the key before running** |
| 013 | `013_pii_enforce_no_plaintext.sql` | Locks the plaintext columns shut. Run after verifying 012 decrypts correctly |
| 014 | `014_customer_employment_fields.sql` | Adds the customer employment/residence columns `api.ts` already queries |
| 015 | `015_tenants_and_feature_flags.sql` | Tenants table (cercit as the default) and module switches, all off; switch history kept |

## Quick start

1. Create a Supabase project
2. Run scripts 001 through 009, then 011, in order in the SQL Editor
3. Create auth users in the dashboard per `010_seed_auth_users.sql` instructions
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
5. Login with `officer@cercit.in` / `cercit2026`

## PII encryption (012 / 013)

PAN and mobile are encrypted at rest with pgcrypto. Before running `012`:

1. Generate a key — `openssl rand -base64 48`
2. Paste it into the `INSERT INTO app_secrets` line in `012_pii_encryption.sql`
3. Store the key in your password manager. **Lose it and the data is gone.**

After running `012`, confirm decryption round-trips before running `013`:

```sql
SELECT pan_last4, fn_pii_decrypt(pan_enc) AS pan FROM customers LIMIT 5;
```

The app reads masked values (`XXXXXX234F`) everywhere. A full value needs the
`fn_customer_pii` RPC, which is officer-only and writes a `PII_REVEAL` audit event.

## Demo mode (no Supabase)

The app also works without a Supabase connection. Log in with `demo@cercit.in` and any password to use mock data.
