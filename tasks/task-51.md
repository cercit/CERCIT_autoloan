# Task 51 — Wire assessment into copilot review

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

In `src/components/copilot-review.tsx`, call `runAssessment(app)` and display the engine's output — replacing the hardcoded recommendation display with the live engine result. Show the final decision badge, reason codes, risk flags, and a layer-by-layer breakdown in collapsible sections.

## Current state

- `src/components/copilot-review.tsx` (777 lines) displays the AI recommendation from `app.recommendation` and `app.reasons` — these come directly from mock data, not from the engine
- The component has a `Collapsible` helper for expandable sections (lines 56-86)
- `StatusPill` and `Pill` are available from `@/components/status`
- `src/lib/engine.ts` exports `runAssessment(app)` returning `AssessmentResult` (task 50)
- `AssessmentResult` has: `hardFilters`, `bureau`, `income`, `ltv`, `policy`, `decision` (with `decision.decision`, `decision.reasons`, `decision.riskFlags`, `decision.suggestedRate`)

## Steps

### 1. Import and run the assessment

At the top of `copilot-review.tsx`, add:

```typescript
import { runAssessment } from "@/lib/engine";
import type { AssessmentResult } from "@/lib/engine";
```

Inside the `CopilotReview` component, compute the assessment result. Since `runAssessment` is synchronous (pure calculation, no API calls), use `useMemo`:

```typescript
import { useMemo } from "react";

const assessment = useMemo(() => runAssessment(app), [app]);
```

### 2. Replace the AI Recommendation section

Replace the existing recommendation section (the `<section>` with colored border around lines 183-231) with one driven by the engine result:

- **Decision badge:** Show `assessment.decision.decision` — "APPROVE" in a green badge, "REJECT" in red, "MAYBE" in amber
- **Suggested rate:** If APPROVE or MAYBE, show `assessment.decision.suggestedRate`
- **Reason codes:** Render `assessment.decision.reasons` as a bulleted list (replacing `app.reasons`)
- **Risk flags:** If `assessment.decision.riskFlags` is non-empty, render as warning pills inside the amber border box (replacing `app.flags`)

Use the tone mapping:

```typescript
const decisionTone = {
  APPROVE: "success",
  MAYBE: "warning",
  REJECT: "destructive",
} as const;
```

### 3. Add layer breakdown in a collapsible section

Below the recommendation section, add a new `Collapsible` titled "Assessment Breakdown" with nested collapsibles or a simple list showing each layer:

- **Hard Filters:** "Passed" (green) or list of failures
- **Bureau:** Band, score, flags, reject reasons
- **Income:** FOIR value, net surplus, computed income
- **LTV:** LTV on ex-showroom, LTV on on-road
- **Policy:** "All rules passed" or list of violations with actual vs limit

Keep the existing collapsible sections (Customer Profile, Income Assessment, Bureau Summary, etc.) — they show the detailed evidence. The new section is a compact summary of the engine's evaluation.

### 4. Keep backward compatibility

The existing `app.recommendation` field still drives the "AI:" pill in the header bar and the override detection logic. Do not remove those — the engine result augments the display, it does not replace the quick-action buttons or decision submission flow.

Run `npx tsc --noEmit` after each change.

## Files to edit

- `src/components/copilot-review.tsx` — import `runAssessment`, compute assessment via `useMemo`, replace recommendation display, add breakdown section

## Done when

- `npx tsc --noEmit` exits clean
- `runAssessment(app)` is called once per render (via `useMemo`)
- The AI Recommendation section shows the engine's decision, reasons, and risk flags instead of hardcoded `app.reasons`/`app.flags`
- Decision badge color: APPROVE = green, REJECT = red, MAYBE = amber
- An "Assessment Breakdown" collapsible shows each layer's result
- Existing quick-action buttons (Approve/Reject) still work
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/link has a working handler
- Every new data field resolves from its source, not a hardcoded fallback
