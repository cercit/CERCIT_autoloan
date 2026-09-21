# B6 — End-to-End Test Plan

Status: INTERRUPTED in subagent B6; produced manually in hermes2.

## Source references
- `tests/` — Playwright tests (`tests/site-audit.spec.ts`, `tests/` folder structure).
- `playwright.config.ts` — base URL, viewport settings, workers.
- `docs/application_flow.md` — 4-step customer flow, 5-step employee review.
- `docs/current_state_workflow.md` — decision pipeline steps.
- `docs/build-progress.md` — 54 passing tests target, CI workflow `verify.yml`.

## E2E scenario (full journey)
1. **Apply**: Customer fills application (`/applications/new`) — demographics, PAN, employment, income, vehicle selection. Submits.
2. **Upload**: Customer uploads salary slip, Form 16, KYC (Aadhaar + PAN photo). Upload triggers Lambda (`salary-slip`, `kyc`) via `presigned-url` endpoint.
3. **Extract**: Lambda processes uploads; `get-extractions` returns extracted data (income from salary slip, PAN validation from KYC, employment verification from employer DB).
4. **Assess**: System runs assessment (engine + policy rules after A1/A2/A6/A10 wired). `engine_decisions` table updated with outcome.
5. **Decision**: Officer reviews application (`/applications/$id`). Sees recommendation pill, engine badge (A1), policy label (A2), timeline (A10). Approves/rejects/refer.
6. **Audit**: `audit_trail` records every step (created, submitted, assessment completed, approved/rejected/referred). Audit page (`/audit-log`, A7) shows entries.
7. **Output**: In-principle approval or sanction letter rendered; customer receives email (future); application status updated.

## Test data requirements
- Mock user accounts: `demo1@cercit.in` (officer), `demo2@cercit.in` (manager), `admin@cercit.in`.
- Mock application IDs: `APP-2026-00123` format.
- Mock salary slip PDF (uploaded via upload endpoint) — `data/demo_salary_slip_aug2026.pdf`.
- Mock PAN/Aadhaar images for KYC — synthetic (no real identity data per `CLAUDE.md`).
- Mock employer records: `employers` table with verified/unverified status.

## Verification steps (manual — Claude)
- [ ] Run `npx playwright test --project=chrome` — 54 passing tests (28 × 2 viewports).
- [ ] Confirm `tests/site-audit.spec.ts` covers desktop + mobile.
- [ ] Confirm `tests/` folder has no broken fixtures or stale mock references.
- [ ] Confirm `.github/workflows/verify.yml` passes (types, policy, SQL, Lambda, parity checks).
- [ ] Confirm `docs/build-progress.md` updated with FD8 + FD6 entries.
- [ ] Confirm full journey works: `apply` → upload → extract → assess → decision → audit entry visible.

## Assumptions / Dependencies (`.meta.json`)
- 54 Playwright tests is target; current `tests/` may have fewer assertions — additional specs must be added.
- Full journey requires all upstream tasks completed: A1 (engine badge), A2 (policy label), A3 (timeout), A4 (stats), A5 (chart), A6 (rate grid), A7 (audit), A8 (users), A9 (employers), A10 (timeline), B1 (price integration), FD8 (deploy verification).
- Without upstream fixes, E2E test will show mock data or missing components; test results may not fully validate real DB wiring until all tasks merged.
