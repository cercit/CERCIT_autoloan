# cercit build log

The platform is being rebuilt module by module on top of this codebase. The current site keeps working throughout: each new piece is built beside the old one behind a feature switch, switched on once it passes its checks, and the old piece is then removed.

## The loop

1. **Pick** the next task from the backlog (one at a time).
2. **Develop** on a branch.
3. **Test** — `npx tsc --noEmit`, the 40 policy scenarios (`node scripts/run-test-cases.ts`), and the module's own tests. Task FD7.1 wraps these into `npm run verify`.
4. **Integrate** — merge to `main` with the feature switch off.
5. **Go** — switch on, check it by hand, deploy.
6. **Retire** — delete the code the new piece replaced.
7. **Record** — add an entry below.

A task is done when its code is merged, tests pass, it is deployed with its switch on, and the old path is removed (or listed for removal at the end of its module).

## Branches and migrations

- Branch: `mod/<task-id>-<short-name>`, e.g. `mod/fd0.1-feature-flags`
- Commit message starts with the task ID, e.g. `FD0.1: add feature_flags table`
- Migrations are new numbered files in `sql/` (next free number: 015). They are reviewed and run by hand in the Supabase SQL editor; never edited after they have been run.
- This repository is public. Keys, passwords, provider credentials and security review findings never go in it; they live in Supabase / AWS secret stores and private notes.

## Build order

| Stage | Weeks | Modules |
|---|---|---|
| Ground | 1 | Decisions, checks, pending migrations |
| Foundation | 2–5 | Feature switches, versioned rule values with approvals, server-side permission checks, one server-side decision engine |
| Admin | 6–7 | Users, roles, limits |
| Credit control | 8–10 | Policy and pricing changes with approval and impact check |
| KYC | 11–13 | Consent, KYC methods on mock providers, risk rating |
| Underwriting | 14–18 | Documents, bureau, bank data, model scoring, deviations |
| Sanction | 19–20 | Key Fact Statement, letters, notifications |
| Compliance | 21 | Audit trail, version on every case |
| Roof | 22–24 | Admin console, app split, review, deploy |

## Decisions

| Date | # | Decision |
|---|---|---|
| 17 Sep 2026 | 0.1 | FOIR stays as the database engine computes it: net salary + other income |
| 17 Sep 2026 | 0.2 | LTV stays as today: ex-showroom primary, on-road rule kept |
| 17 Sep 2026 | 0.3 | Demo login kept during the build; revisited later |
| 17 Sep 2026 | 0.4 | Server-side logic stays on Supabase |
| 17 Sep 2026 | 0.5 | Rules run in GoRules Zen (MIT) on a Python 3.12 AWS Lambda in `ap-south-1`, confirmed after evaluation 0.5a. Rule versions and approvals stay in our tables |
| 17 Sep 2026 | 0.6 | `tenant_id` added to tables from the start |
| 17 Sep 2026 | 0.7 | Hosting: Supabase + AWS `ap-south-1` |
| 17 Sep 2026 | 0.11 | Repository stays public (needed for the GitHub Pages demo) |

## Entries

| Date | Task | What changed |
|---|---|---|
| 17 Sep 2026 | 0.1–0.8 | Week 1 decisions recorded; regulatory values for prepayment charges, KFS, Aadhaar OTP limits and penal charges checked against RBI sources |
| 17 Sep 2026 | baseline | 40/40 policy scenarios pass on `main` at `249a078` — the reference point for the engine parity test |
| 17 Sep 2026 | 0.5a | Rules engine evaluation: GoRules Zen and json-rules-engine both matched today's engine on 40 scenarios and 2,000 generated cases. Recommended Zen on a Python 3.12 Lambda in `ap-south-1`; Zen does not load in Supabase's Deno runtime. Details in `docs/engine-evaluation/` |
