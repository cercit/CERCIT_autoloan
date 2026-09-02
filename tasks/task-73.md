# Task 73 — Real-time eligibility indicator on application form

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a small eligibility indicator panel to the new application form that updates in real time as the user fills fields. Shows a preliminary approve/maybe/reject signal based on the values entered so far (CIBIL score, income, loan amount).

## Current state

- `src/routes/applications/new.tsx` renders the new application form with fields for income, loan amount, CIBIL score, etc.
- `src/lib/engine.ts` has `calculateIncome` and `calculateLTV` functions
- `src/lib/format.ts` exports `inr()` and `emiFor()`
- `src/components/status.tsx` exports `Pill` with tone support
- No real-time eligibility indicator exists

## Steps

### 1. Add `quickEligibility` to `src/lib/engine.ts`

```typescript
export type QuickEligibilityResult = {
  signal: "LIKELY_APPROVE" | "MAYBE" | "LIKELY_REJECT" | "INSUFFICIENT_DATA";
  reasons: string[];
  foir: number | null;
  emi: number | null;
};

export function quickEligibility(
  cibilScore: number | null,
  monthlyIncome: number | null,
  loanAmount: number | null,
  tenure: number | null,
  existingEmi: number | null
): QuickEligibilityResult {
  if (!cibilScore || !monthlyIncome || !loanAmount) {
    return { signal: "INSUFFICIENT_DATA", reasons: ["Fill CIBIL score, income, and loan amount"], foir: null, emi: null };
  }

  const reasons: string[] = [];
  const rate = cibilScore >= 750 ? 8.99 : cibilScore >= 700 ? 9.5 : 10.5;
  const months = tenure ?? 60;
  const monthlyRate = rate / 100 / 12;
  const emi = Math.round(loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1));
  const totalEmi = emi + (existingEmi ?? 0);
  const foir = Math.round((totalEmi / monthlyIncome) * 100 * 10) / 10;

  if (cibilScore < 650) reasons.push("CIBIL below 650 threshold");
  if (cibilScore >= 750) reasons.push("Strong CIBIL score");
  if (foir > 65) reasons.push(`FOIR ${foir}% exceeds 65% limit`);
  else if (foir > 50) reasons.push(`FOIR ${foir}% is elevated`);
  else reasons.push(`FOIR ${foir}% is healthy`);

  let signal: QuickEligibilityResult["signal"];
  if (cibilScore < 650 || foir > 65) signal = "LIKELY_REJECT";
  else if (cibilScore < 700 || foir > 50) signal = "MAYBE";
  else signal = "LIKELY_APPROVE";

  return { signal, reasons, foir, emi };
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/eligibility-indicator.tsx`

Build a component that:
- Takes `cibilScore`, `monthlyIncome`, `loanAmount`, `tenure`, `existingEmi` as props (all `number | null`)
- Calls `quickEligibility` internally on every render
- Renders a small card:
  - Top: a `Pill` showing the signal (green for LIKELY_APPROVE, amber for MAYBE, red for LIKELY_REJECT, gray for INSUFFICIENT_DATA)
  - Below: list of reason strings
  - If FOIR and EMI are available, show them as small label-value pairs

Run `npx tsc --noEmit`.

### 3. Add `<EligibilityIndicator>` to `src/routes/applications/new.tsx`

Import and render the indicator in a sticky sidebar or at the top of the form. Pass the relevant form field values as props so it updates as the user types.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/engine.ts` — add `QuickEligibilityResult` type and `quickEligibility` function
- `src/components/eligibility-indicator.tsx` — new file
- `src/routes/applications/new.tsx` — import and render indicator with form state values

## Done when

- `npx tsc --noEmit` exits clean
- Indicator updates in real time as form fields change
- Shows color-coded signal: green/amber/red/gray
- Shows FOIR and estimated EMI when enough data is available
- Shows reason strings explaining the signal
- `quickEligibility` uses correct EMI calculation formula
- No `// # reason:` or `// Self-review` comments in any edited file
