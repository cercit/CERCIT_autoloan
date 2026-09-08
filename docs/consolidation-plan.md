# Consolidation plan

## Current state

**66 Hermes tasks written (91-156), all output files on disk.**
- Tasks 81-98, 100 moved to `done/`
- Tasks 99, 101-156 still in `queue/` (code built, .md not moved)

**Two layers of code coexist:**
1. **Lovable layer** — original app from Lovable export. Tightly coupled: components import from `mock-data`, `api`, `engine`, `workflow`. Routes in `routes/` wire these together. The running app.
2. **Hermes layer** — 66 standalone files with explicit typed props, no coupling to mock-data or api.ts. Not wired into routes yet.

## Audit results (20 pairs checked)

| Verdict | Count | Action |
|---|---|---|
| KEEP_NEW (Hermes better) | 7 | Delete old after route migration |
| KEEP_BOTH (different purpose) | 8 | Both stay, not duplicates |
| MERGE needed | 3 | Combine best of each |

### Files to delete (after route migration)
- `components/bureau-report.tsx` → replaced by `bureau-report-card.tsx`
- `components/cam-report.tsx` → replaced by `cam-preview.tsx`
- `components/application-timeline.tsx` → replaced by `audit-trail-timeline.tsx`
- `components/document-upload.tsx` → replaced by `document-upload-zone.tsx`
- `components/extraction-result.tsx` → replaced by `document-extraction-review.tsx`
- `components/notification-bell.tsx` → replaced by `notification-dropdown.tsx`
- `components/bank-statement-summary.tsx` → replaced by `cashflow-summary-card.tsx`
- `components/skeletons/dashboard-skeleton.tsx` → replaced by `skeleton-loaders.tsx`
- `components/skeletons/applications-skeleton.tsx` → replaced by `skeleton-loaders.tsx`

### Files that are NOT duplicates (both stay)
- `foir-calculator.tsx` (interactive calc) vs `foir-gauge.tsx` (display) — both needed
- `application-card.tsx` (grid card) vs `application-summary-strip.tsx` (list strip) — different layouts
- `score-gauge.tsx` (CIBIL arc) vs `risk-score-explainer.tsx` (ML waterfall) — different data
- `income-comparison.tsx` (cross-doc validation) vs `income-summary-card.tsx` (waterfall) — both needed
- `override-panel.tsx` (action dialog) vs `policy-verdict-card.tsx` (display) — different functions
- `scheme-card.tsx` (display) vs `scheme-eligibility.ts` (logic) — UI + logic pair
- `document-checklist.tsx` (UI) vs `document-orchestrator.ts` (logic) — UI + logic pair
- `employer-autocomplete.tsx` (UI) vs `employer-verifier.ts` (logic) — UI + logic pair

### Merges needed
1. **auth.ts + supabase-auth.ts** → keep `auth.ts`, add ROLE_PERMISSIONS and hasPermission() from supabase-auth
2. **bank-statement-transactions.tsx + transaction-table.tsx** → keep `transaction-table.tsx`, add pagination from old
3. **engine.ts + policy-rule-engine.ts** → keep `engine.ts`, absorb POLICY_RULES array pattern from new

### File that blocks deletion
`routes/applications/$id/index.tsx` imports 5 old files:
- BankStatementSummary, BankStatementTransactions, DocumentUpload, ExtractionResult, ApplicationTimeline, CamReport

These must be re-wired before old files can be deleted.

---

## What's actually left to build

### Phase A — Consolidation (do first)
1. Run the 3 merges
2. Move completed task .md files (99, 101-156) to `done/`
3. Run `npx tsc --noEmit` to check the full build

### Phase B — Route migration (rewire the app)
The existing routes use Lovable's mock-data layer. Migrating means:
1. Update `routes/applications/$id/index.tsx` to use Hermes components
2. Update `routes/applications/index.tsx` (list page) to use `application-queue.tsx` + `application-filter-bar.tsx`
3. Update `routes/dashboard/index.tsx` to use `dashboard-kpi-row.tsx`
4. Build new routes for customer portal (form, status tracker, help)
5. Delete the 9 old files once no imports point to them

### Phase C — Supabase wiring (the real work)
All Hermes files use mock fallbacks. Wiring means:
1. Set environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)
2. Replace mock fallbacks in supabase-*.ts files with live queries
3. Wire RPC wrappers to the 8 existing PostgreSQL functions
4. Test auth flow end to end
5. Test the full assessment pipeline: upload doc → extract → bureau → policy → decision → CAM

### Phase D — Integration testing
1. Customer flow: apply → upload docs → track status
2. Officer flow: queue → review → assess → decide → override
3. CAM generation and print
4. E-sign and disbursal tracking

---

## Component inventory (final count)

### Hermes-built (66 files, all on disk)
**Libraries (22 files in src/lib/):**
pdf-text-extract, salary-slip-parser, pan-validator, aadhaar-validator,
bank-statement-parser, transaction-categorizer, cashflow-analyzer,
bureau-score-interpreter, foir-calculator, ltv-calculator, policy-rule-engine,
risk-score-model, cam-data-assembler, document-classifier, address-proof-parser,
document-orchestrator, bureau-api-mock, scheme-eligibility, agreement-generator,
supabase-application, supabase-bureau, supabase-decision-log, supabase-audit-trail,
supabase-documents, supabase-dealers, supabase-rpc, supabase-auth,
indian-date-utils, employer-verifier

**Components (34 files in src/components/):**
dealer-card, kyc-status-strip, vehicle-info-card, loan-comparison-table,
approval-stamp, income-summary-card, policy-violation-alert, collateral-summary,
activity-feed, repayment-progress, cashflow-summary-card, transaction-table,
document-extraction-review, bureau-report-card, foir-gauge, policy-verdict-card,
cam-preview, esign-consent-flow, risk-score-explainer, audit-trail-timeline,
application-summary-strip, document-upload-zone, rate-card-picker,
decision-override-form, otp-verification-step, disbursal-tracker,
nach-mandate-form, application-form-steps, customer-status-tracker,
help-support-panel, dashboard-kpi-row, application-queue,
manual-review-workspace, application-detail-layout, skeleton-loaders,
notification-dropdown, application-filter-bar

### Lovable original (keeping)
**Libraries:** api.ts, auth.ts, engine.ts, format.ts, mock-data.ts, pdf.ts, supabase.ts, utils.ts, workflow.ts, error-capture.ts, error-page.ts, lovable-error-reporting.ts
**Components:** app-shell, copilot-review, document-list, officer-notes, sla-timer, override-panel, escalation-dialog, application-card, score-gauge, income-comparison, foir-calculator, document-checklist, employer-autocomplete, scheme-card, letter-layout, manager-decision-panel, status, theme-toggle, stat-card, confirmation-dialog, risk-matrix, emi-schedule, portfolio-quality, eligibility-indicator, empty-state, shortcut-overlay, decision-trend-chart + all ui/ primitives
