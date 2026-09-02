# Task 34 — Document extraction display component

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create a component that shows extracted fields from a document in a structured table. Each field has: field name, extracted value, confidence score (high/medium/low), and source document. Use hardcoded mock data for now — this will be wired to real extraction later.

## Current state

- `src/components/app-shell.tsx` exports `SectionCard` and `LabelValue`
- `src/components/status.tsx` exports `Pill` with tone support (success/warning/destructive/muted)
- No extraction result component exists yet
- The existing `documents` mock in `mock-data.ts` (line ~491) has field-level data per document but no standalone extraction-result type

## Steps

### 1. Create `src/components/extraction-result.tsx`

Define a local type for extracted fields (not exported to mock-data.ts since this is temporary mock data):

```typescript
import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";

type Confidence = "high" | "medium" | "low";

type ExtractedField = {
  field: string;
  value: string;
  confidence: Confidence;
  source: string;
};

const confidenceTone = {
  high: "success",
  medium: "warning",
  low: "destructive",
} as const;

const mockFields: ExtractedField[] = [
  { field: "Full Name", value: "Rajesh Kumar Sharma", confidence: "high", source: "PAN Card" },
  { field: "PAN Number", value: "ABCDE1234F", confidence: "high", source: "PAN Card" },
  { field: "Employer", value: "Tata Consultancy Services", confidence: "high", source: "Salary Slip — Jul 2026" },
  { field: "Net Monthly Salary", value: "Rs 85,000", confidence: "high", source: "Salary Slip — Jul 2026" },
  { field: "Annual Income (Form 16)", value: "Rs 10,10,000", confidence: "medium", source: "Form 16" },
  { field: "Date of Birth", value: "14 Mar 1994", confidence: "high", source: "PAN Card" },
];
```

Build the component:

```typescript
export function ExtractionResult() {
  return (
    <SectionCard title="Extracted Fields" description={`${mockFields.length} fields extracted`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-subtle text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Field</th>
              <th className="px-3 py-2 text-left font-medium">Value</th>
              <th className="px-3 py-2 text-left font-medium">Confidence</th>
              <th className="px-3 py-2 text-left font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {mockFields.map((f) => (
              <tr key={f.field} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{f.field}</td>
                <td className="px-3 py-2 font-medium">{f.value}</td>
                <td className="px-3 py-2">
                  <Pill tone={confidenceTone[f.confidence]}>
                    {f.confidence}
                  </Pill>
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{f.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/components/extraction-result.tsx` — new file

## Done when

- `npx tsc --noEmit` exits clean
- `ExtractionResult` component renders a table with 6 mock fields
- Each field row shows: field name, extracted value, confidence pill (high=success, medium=warning, low=destructive), source document
- Uses `SectionCard` from app-shell and `Pill` from status
- No `// # reason:` or `// Self-review` comments in any edited file
