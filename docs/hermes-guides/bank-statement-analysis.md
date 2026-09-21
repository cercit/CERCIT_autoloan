# B4 — Bank Statement Intelligence Module

Status: INTERRUPTED in subagent B4; produced manually in hermes2.

## Source references
- `PRD.md` — bank statement analysis (cash flow, EMI bounce detection, salary regularity).
- `docs/current_state_workflow.md` — assessment pipeline includes AA/Perfios data.
- `docs/build-progress.md` — DB schema has 22 tables; bank statement data may come from account aggregator (`Perfios` / `Finbit`).
- `Lov_cercit/src/lib/api.ts` — `getBankStatementAnalysis()` or similar (not fully implemented in source).

## What must be built
1. **Transaction categorization module** (`src/lib/bank-statement-analysis.ts`):
   - Read bank statement CSV / JSON from `perfios` or `finbit` response.
   - Categorize transactions: `salary_credit`, `emi_debit`, `bounce_debit`, `cash_deposit`, `transfer`, `fee_charge`.
   - Calculate signals: average monthly balance, EMI bounce count, salary regularity (number of salary credits / total months), net surplus.
2. **Feature integration** in assessment pipeline:
   - Add `bank_statement_summary` field to application assessment.
   - Use signals as input features to decision engine (`engine_decisions`).
3. **UI review screen** (`src/components/bank-statement-review.tsx`):
   - Show categorized transactions table.
   - Show signal cards (avg balance, bounce count, salary regularity).
   - Highlight red flags (multiple bounces, irregular salary) for officer review.

## Assumptions / Risks (`.meta.json`)
- Data source is `Perfios` / `Finbit` account aggregator (mentioned in `PRD.md`); no real API endpoint configured in `.env`.
- No synthetic bank statement dataset exists; mock data must be generated for testing.
- Integration into `engine_decisions` requires ML model (B5 interrupted) or deterministic policy rules; without B5, bank statement signals cannot feed into automated decision.
- Mock fallback (`isSupabaseConfigured`) required per rules.
