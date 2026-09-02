# Task 59 — Fraud flags display in copilot review

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a "Risk Flags" section to `copilot-review.tsx` that shows fraud flags from the assessment. Each flag is displayed as a card with severity badge, flag type, and detail text. The section is hidden when there are no flags.

## Current state

- `src/components/copilot-review.tsx` calls `runAssessment(app)` via `useMemo` (task 51)
- `AssessmentResult` includes `fraud: FraudCheckResult` with `flags: FraudFlag[]` (task 58)
- `FraudFlag` has `type: string`, `severity: "high" | "medium" | "low"`, `detail: string`
- The component already has a `Collapsible` helper (lines 56-86) and uses `Pill` from `@/components/status`
- `AlertTriangle` icon is already imported from lucide-react

## Steps

### 1. Add the Risk Flags section to `copilot-review.tsx`

Place this after the "Assessment Breakdown" collapsible (task 51) and before the "Customer Profile" collapsible. Only render when there are flags:

```tsx
{assessment.fraud.flags.length > 0 && (
  <Collapsible
    title="Risk Flags"
    defaultOpen={true}
    right={
      <Pill tone="destructive">{assessment.fraud.flags.length} flag{assessment.fraud.flags.length > 1 ? "s" : ""}</Pill>
    }
  >
    <div className="space-y-3">
      {assessment.fraud.flags.map((flag) => {
        const severityTone = flag.severity === "high"
          ? "destructive"
          : flag.severity === "medium"
            ? "warning"
            : "muted";
        return (
          <div
            key={flag.type}
            className={cn(
              "rounded-md border p-3",
              flag.severity === "high" && "border-destructive/40 bg-destructive/5",
              flag.severity === "medium" && "border-warning/40 bg-warning/5",
              flag.severity === "low" && "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              {flag.severity === "high" && (
                <AlertTriangle className="size-4 text-destructive" />
              )}
              <span className="text-sm font-medium">{flag.type}</span>
              <Pill tone={severityTone}>{flag.severity}</Pill>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{flag.detail}</p>
          </div>
        );
      })}
    </div>
  </Collapsible>
)}
```

### 2. Verify the Pill tone types

The `Pill` component in `src/components/status.tsx` accepts a `tone` prop. Verify that `"muted"` is a valid tone. If it only accepts `"success" | "warning" | "destructive" | "primary"`, use one of those for the low-severity case (e.g. render low-severity flags without a Pill, or use a plain text label). Check the actual `Pill` component signature and adjust.

Run `npx tsc --noEmit`.

## Files to edit

- `src/components/copilot-review.tsx` — add Risk Flags section

## Done when

- `npx tsc --noEmit` exits clean
- Risk Flags section appears when `assessment.fraud.flags.length > 0`
- Section is completely hidden when there are no flags
- Each flag shows severity badge, type, and detail text
- High-severity flags have red border, warning icon, and destructive pill
- Medium-severity flags have amber border and warning pill
- Low-severity flags have neutral border
- The section header shows the flag count as a pill
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new data field resolves from its source, not a hardcoded fallback
