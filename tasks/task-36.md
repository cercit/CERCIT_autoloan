# Task 36 — Bureau report display component

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create `src/components/bureau-report.tsx` that displays CIBIL/bureau data in a structured layout with four sections: Score (large number with color), Account Summary, DPD History table, and Enquiry Summary. Add the `BureauReport` type and mock data to `mock-data.ts`.

## Current state

- `src/lib/mock-data.ts` has `bureauMetrics` (line ~522) and `dpdHistory` (line ~533) as standalone arrays — used directly in `copilot-review.tsx`
- No typed `BureauReport` object exists
- `src/components/app-shell.tsx` exports `SectionCard` and `LabelValue`
- `src/components/status.tsx` exports `Pill`
- `src/lib/format.ts` exports `inr()` and `cibilTone()`
- `src/lib/utils.ts` exports `cn()`

## Steps

### 1. Add `BureauReport` type and mock to `src/lib/mock-data.ts`

Add at the end of the file:

```typescript
export type BureauReport = {
  score: number;
  activeAccounts: number;
  closedAccounts: number;
  totalExposure: number;
  overdueAccounts: number;
  writeoffs: boolean;
  settlements: boolean;
  suitsFiled: boolean;
  oldestAccountAge: string;
  dpdHistory: {
    account: string;
    months: string[];
  }[];
  enquiries: {
    last3Months: number;
    last6Months: number;
    last12Months: number;
  };
};

export const mockBureauReport: BureauReport = {
  score: 782,
  activeAccounts: 4,
  closedAccounts: 2,
  totalExposure: 1895000,
  overdueAccounts: 0,
  writeoffs: false,
  settlements: false,
  suitsFiled: false,
  oldestAccountAge: "9 yr 4 mo",
  dpdHistory: [
    { account: "HDFC Home Loan", months: ["0","0","0","0","0","0","0","0","0","0","0","0"] },
    { account: "Axis Credit Card", months: ["0","0","0","0","0","0","0","0","0","0","0","0"] },
    { account: "SBI Auto Loan (closed)", months: ["0","0","0","0","0","0","0","0","0","30","0","0"] },
  ],
  enquiries: {
    last3Months: 3,
    last6Months: 5,
    last12Months: 8,
  },
};
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/bureau-report.tsx`

```typescript
import { SectionCard, LabelValue } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { inr, cibilTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BureauReport as BureauReportType } from "@/lib/mock-data";

export function BureauReport({ data }: { data: BureauReportType }) {
  return (
    <div className="space-y-4">
      {/* Score */}
      <SectionCard title="CIBIL Score">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="sm:w-48">
            <p
              className={cn(
                "text-5xl font-semibold tabular",
                `text-${cibilTone(data.score)}`,
              )}
            >
              {data.score}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gradient-to-r from-destructive via-warning to-success">
              <div
                className="h-full w-0.5 bg-foreground"
                style={{ marginLeft: `${((data.score - 300) / 600) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">300 — 900</p>
          </div>
        </div>
      </SectionCard>

      {/* Account Summary */}
      <SectionCard title="Account Summary">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LabelValue label="Active Accounts" value={String(data.activeAccounts)} />
          <LabelValue label="Closed Accounts" value={String(data.closedAccounts)} />
          <LabelValue label="Total Exposure" value={inr(data.totalExposure)} />
          <LabelValue label="Overdue Accounts" value={String(data.overdueAccounts)} />
          <LabelValue label="Oldest Account" value={data.oldestAccountAge} />
          <LabelValue label="Writeoffs" value={data.writeoffs ? "Yes" : "No"} />
          <LabelValue label="Settlements" value={data.settlements ? "Yes" : "No"} />
          <LabelValue label="Suits Filed" value={data.suitsFiled ? "Yes" : "No"} />
        </div>
      </SectionCard>

      {/* DPD History */}
      <SectionCard title="DPD History" description="Last 12 months">
        <div className="space-y-1.5">
          {data.dpdHistory.map((row) => (
            <div key={row.account} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-xs">{row.account}</span>
              <div className="flex flex-1 gap-1">
                {row.months.map((m, i) => (
                  <span
                    key={i}
                    title={`M-${12 - i}: ${m}`}
                    className={cn(
                      "h-4 flex-1 rounded-sm",
                      m === "0" ? "bg-success/40" : "bg-warning",
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Enquiry Summary */}
      <SectionCard title="Enquiry Summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <LabelValue label="Last 3 months" value={String(data.enquiries.last3Months)} />
          <LabelValue label="Last 6 months" value={String(data.enquiries.last6Months)} />
          <LabelValue label="Last 12 months" value={String(data.enquiries.last12Months)} />
        </div>
      </SectionCard>
    </div>
  );
}
```

**Important:** The CIBIL score color uses `cibilTone()` from format.ts which returns `"success"`, `"warning"`, or `"destructive"`. Since Tailwind needs full class names for JIT, use `cn()` with conditional classes instead of template literals:

```typescript
className={cn(
  "text-5xl font-semibold tabular",
  cibilTone(data.score) === "success" && "text-success",
  cibilTone(data.score) === "warning" && "text-warning",
  cibilTone(data.score) === "destructive" && "text-destructive",
)}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/mock-data.ts` — add `BureauReport` type and `mockBureauReport` export
- `src/components/bureau-report.tsx` — new file

## Done when

- `npx tsc --noEmit` exits clean
- `BureauReport` type is exported from `mock-data.ts`
- `mockBureauReport` contains realistic data matching the existing `bureauMetrics` values
- `BureauReport` component renders four sections: Score, Account Summary, DPD History, Enquiry Summary
- Score displays in the correct color (green >= 750, amber >= 650, red below)
- DPD history shows colored bars (green for 0 DPD, amber for non-zero)
- No `// # reason:` or `// Self-review` comments in any edited file
