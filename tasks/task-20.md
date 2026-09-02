# Task 20 — Add manager referral and decision panel

## Goal
The manager review page currently renders the same CopilotReview as the officer view, with fake referral data injected. Build a real referral notes panel and a manager decision form with override detection.

## Current state
- `src/routes/applications/$id/manager-review.tsx` adds `referredBy` and `referralNote` if missing, then renders `<CopilotReview app={withReferral} manager />`
- The `CopilotReview` component accepts a `manager` prop but barely uses it
- `submitOfficerDecision()` in `api.ts` already supports the `fn_officer_decision` RPC (approve/reject/refer with override tracking)
- The `credit_decisions` table has `officer_decision`, `officer_remarks`, `is_override`, `override_reason`

## What to do

### 1. Create `src/components/manager-decision-panel.tsx`
A panel component that shows:
- **Referral details** at the top: who referred, when, their note
- **Officer's original recommendation** (from the application's recommendation field) with the AI-generated summary
- **Manager decision form** with:
  - Decision radio group: Approve / Reject / Refer back to officer
  - If decision differs from AI recommendation, show an "Override reason" textarea (required)
  - Remarks textarea (optional)
  - Sanctioned amount input (pre-filled with recommended amount, editable)
  - Sanctioned rate input (pre-filled with recommended rate, editable)
  - Submit button

### 2. Wire form submission
- On submit, call `submitOfficerDecision()` from `src/lib/api.ts` with the form values
- Pass `overrideReason` if the decision differs from recommendation
- Show success/error feedback after submission
- On success, navigate back to the application detail page

### 3. Update manager-review.tsx
- Import and render `<ManagerDecisionPanel app={app} />` below the CopilotReview
- Remove the fake referral data injection — if referral info is missing, show "Direct review (no referral)" instead of faking it

## Files to edit
- `src/components/manager-decision-panel.tsx` — new file
- `src/routes/applications/$id/manager-review.tsx` — use the new panel, remove fake data

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
