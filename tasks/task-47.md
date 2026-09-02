# Task 47 — Bureau assessment engine (Decision Layer 2)

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `assessBureau(app: Application, bureau: BureauReport)` to `src/lib/engine.ts`. This function evaluates bureau data against policy thresholds — CIBIL band assignment, DPD rejection flag, enquiry velocity flag, and exposure summary. It returns a typed `BureauAssessment` object the downstream decision router uses.

## Current state

- `src/lib/engine.ts` exists with `runHardFilters` (task 46) and earlier functions from tasks 42-44
- `src/lib/mock-data.ts` exports the `Application` type but does NOT export a `BureauReport` type — it needs to be defined
- The mock data has `bureauMetrics` (key-value pairs) and `dpdHistory` (account-level DPD arrays) but no structured `BureauReport` type
- `Application` already has `cibil`, `obligations` (with `dpd` field), and `flags`

## Steps

### 1. Define `BureauReport` and `BureauAssessment` types in `src/lib/mock-data.ts`

Add at the end of the type exports section (before the data arrays):

```typescript
export type BureauReport = {
  score: number;
  activeAccounts: number;
  overdueAccounts: number;
  totalOutstanding: number;
  enquiries90Days: number;
  oldestAccountMonths: number;
  writeoffs: boolean;
  settlements: boolean;
  suitsFiled: boolean;
  dpdHistory: { account: string; months: string[] }[];
};
```

### 2. Add a mock bureau report for each application in `src/lib/mock-data.ts`

Add a helper function that builds a `BureauReport` from an existing `Application`:

```typescript
export function buildMockBureau(app: Application): BureauReport {
  const maxDpd = app.obligations.reduce((max, o) => {
    const dpd = parseInt(o.dpd, 10) || 0;
    return dpd > max ? dpd : max;
  }, 0);
  return {
    score: app.cibil,
    activeAccounts: app.obligations.length + 1,
    overdueAccounts: app.obligations.filter((o) => parseInt(o.dpd, 10) > 0).length,
    totalOutstanding: app.obligations.reduce((sum, o) => sum + o.outstanding, 0),
    enquiries90Days: app.flags.some((f) => f.includes("enquiries")) ? 3 : 1,
    oldestAccountMonths: 60,
    writeoffs: false,
    settlements: false,
    suitsFiled: false,
    dpdHistory: app.obligations.map((o) => ({
      account: `${o.lender} ${o.type}`,
      months: Array.from({ length: 12 }, (_, i) => i === 0 ? o.dpd : "0"),
    })),
  };
}
```

### 3. Add `BureauAssessment` type and `assessBureau` function in `src/lib/engine.ts`

```typescript
import type { Application, BureauReport } from "@/lib/mock-data";

export type CibilBand = "A" | "B" | "C";

export type BureauAssessment = {
  band: CibilBand;
  score: number;
  reject: boolean;
  rejectReasons: string[];
  flags: string[];
  activeAccounts: number;
  totalExposure: number;
};

export function assessBureau(app: Application, bureau: BureauReport): BureauAssessment {
  const flags: string[] = [];
  const rejectReasons: string[] = [];

  // CIBIL band
  let band: CibilBand = "C";
  if (bureau.score >= 750) band = "A";
  else if (bureau.score >= 650) band = "B";

  // DPD check — any 90+ DPD in last 24 months is a reject
  const has90PlusDpd = bureau.dpdHistory.some((account) =>
    account.months.some((m) => parseInt(m, 10) >= 90)
  );
  if (has90PlusDpd) {
    rejectReasons.push("90+ DPD observed in last 24 months");
  }

  // Enquiry velocity — >6 in 3 months is a flag
  if (bureau.enquiries90Days > 6) {
    flags.push(`High enquiry velocity: ${bureau.enquiries90Days} in 90 days (threshold: 6)`);
  }

  // Writeoffs and settlements
  if (bureau.writeoffs) rejectReasons.push("Active writeoff on bureau");
  if (bureau.settlements) flags.push("Settlement recorded on bureau");
  if (bureau.suitsFiled) rejectReasons.push("Suits filed flag on bureau");

  return {
    band,
    score: bureau.score,
    reject: rejectReasons.length > 0,
    rejectReasons,
    flags,
    activeAccounts: bureau.activeAccounts,
    totalExposure: bureau.totalOutstanding,
  };
}
```

Run `npx tsc --noEmit` after each file change.

## Files to edit

- `src/lib/mock-data.ts` — add `BureauReport` type and `buildMockBureau` function
- `src/lib/engine.ts` — add `BureauAssessment` type and `assessBureau` function

## Done when

- `npx tsc --noEmit` exits clean
- `BureauReport` type is exported from `mock-data.ts`
- `buildMockBureau` constructs a `BureauReport` from an existing `Application`
- `assessBureau` returns a typed `BureauAssessment` with band, reject flag, reasons, and flags
- 90+ DPD triggers a reject; >6 enquiries triggers a flag (not a reject)
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new type and function is exported
