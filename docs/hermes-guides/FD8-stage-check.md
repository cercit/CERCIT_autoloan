# FD8 — Stage Check / Deploy Verification (hermes2 version)

Status: BLOCKED — requires Claude's manual verification.

Source evidence: `docs/build-progress.md` (Live: 42 tasks done), `docs/cercit-status.html` (FD8 listed as blocked/needs-Claude), `.github/workflows/verify.yml` (CI active), `tests/site-audit.spec.ts` (Playwright), `aws/` (SAM template for Lambda deploy).

## Verification checklist (manual — Claude must execute)

### 1. Build verification
- [ ] `cd Lov_cercit && npx tsc --noEmit` — exits 0.
- [ ] No `// # reason:` or `// Self-review` comments in source (per `tasks/hermes-rules.md`).
- [ ] `npm run build` (SPA config `vite.spa.config.ts`) passes.

### 2. Demo verification
- [ ] Open live site (`https://cercit.github.io/CERCIT_autoloan` or local `dist/`).
- [ ] Customer 4-step form submits; employee 5-step review loads.
- [ ] CIBIL gauge, FOIR bar, policy grid render with real data (after A1/A2/A6 fixes).
- [ ] Application review screen shows recommendation pill + engine badge.
- [ ] In-principle approval and sanction letters render.
- [ ] Officer approve/reject actions persist in DB.
- [ ] Approvals inbox (`/approvals`) shows pending counts.
- [ ] Rate grid (`/rate-grid`) displays 3 DB rows (after A6 fix).
- [ ] Audit log (`/audit-log`) shows real entries (after A7 fix).
- [ ] User list (`/users`) and employer verify (`/employers`) work (after A8/A9 fixes).
- [ ] Timeline (`/$id`) renders audit events (after A10 fix).
- [ ] Dashboard stat cards show live counts (after A4 fix).
- [ ] Decision chart shows live pie data (after A5 fix).

### 3. AWS Lambda verification
- [ ] Stack `cercit-pipeline` deployed in `ap-south-1`.
- [ ] 6 Lambda handlers respond: `salary-slip`, `form-16`, `kyc`, `cross-validator`, `presigned-url`, `get-extractions`.
- [ ] Lambda endpoint URLs configured in `.env` (`VITE_AWS_API_URL`).

### 4. Playwright / CI verification
- [ ] `npx playwright test` — 54 passing (28 tests × 2 viewports) per `docs/build-progress.md`.
- [ ] `.github/workflows/verify.yml` passes (types, policy, SQL checks, Lambda tests).
- [ ] `docs/build-progress.md` updated with FD8 entry.

### 5. Database/state verification
- [ ] `rate_grid` shows 3 rows (APPROVE 8.99%, MAYBE 9.90%, REJECT 0%).
- [ ] `engine_decisions` contains engine outcomes for demo apps (after A1 wired).
- [ ] `audit_trail` shows chronological entries (after A7 wired).
- [ ] `users` / `employers` tables populated (after A8/A9 wired).

## Assumptions (`.meta.json`)
- FD8 is the final stage-check step before marking build complete; it does NOT cover B3–B7 (document pipeline, ML model, E2E, Cloudflare, bank statement) — those are separate blocked items.
- Manual verification required by Claude: open browser, run through full user journey (`apply` → `upload` → `extract` → `assess` → `decision`).
- 54 Playwright tests is the target; current `tests/site-audit.spec.ts` may have fewer assertions — additional E2E specs must be added (see B6 interrupted task).
