# Practice logins: what Sameer sets up (fix list D1–D3)

Three logins let visitors do the real jobs on synthetic customers only. The database side is `sql/072` (roles, guards) and `sql/073` (reset).

## One-time setup

1. Run `sql/072` and `sql/073` (they are in `sql/RUN-ME-fix-list.sql`).
2. In Supabase: **Authentication → Users → Add user**, tick **Auto Confirm**, for each of:
   - `cercit+practice.officer@gmail.com`
   - `cercit+practice.manager@gmail.com`
   - `cercit+practice.head@gmail.com`

   Give all three the **same** password. It will be shown on the sign-in page, so use one you don't use anywhere else.
3. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name `VITE_PRACTICE_PASSWORD`, value the password from step 2.
4. The next deploy shows **Try as Officer / Manager / Head** under the demo box on the Official sign-in page.

## What each can do

| Login | Sees | Can |
|---|---|---|
| Practice Officer | own and unassigned cases | check and decide |
| Practice Manager | every case | check, decide, override |
| Practice Head | every case | as the manager, plus draft and simulate credit policy (never sent for approval or made live) |

All three: synthetic customers only for any change, no real customers, no full PAN or mobile, no new applications, no users, roles, models, employers or approvals. Never locked out by wrong passwords.

## Freshening the practice cases

In the SQL editor: `select fn_practice_reset();` puts every case a practice login touched back as it was, removes their overrides and cancels their policy drafts. The audit log keeps what they did.
