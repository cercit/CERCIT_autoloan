# Task 37 — Add bureau tab to application detail

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a "Bureau" tab (Tab 4) to the application detail page tabs (from task 35). Import and render the `BureauReport` component. Add `getBureauReport(applicationId)` to api.ts with a Supabase query on the `bureau_reports` table and mock fallback using `mockBureauReport`.

## Current state

- `src/routes/applications/$id/index.tsx` has a `<Tabs>` layout with three tabs: Overview, Documents, Extracted Data (from task 35)
- `src/components/bureau-report.tsx` exports `BureauReport` component (from task 36) — takes `{ data: BureauReport }` prop
- `src/lib/mock-data.ts` exports `BureauReport` type and `mockBureauReport` (from task 36)
- `src/lib/api.ts` has no `getBureauReport` function yet
- The existing `getApplication` query already joins `bureau_reports(score)` (line ~158) but only pulls the score

## Steps

### 1. Add `getBureauReport` to `src/lib/api.ts`

Import `mockBureauReport` and `BureauReport` type:

```typescript
import {
  // ... existing imports ...
  mockBureauReport,
} from "./mock-data";
import type { Application, PolicyRule, BureauReport } from "./mock-data";
```

Add the function:

```typescript
export async function getBureauReport(applicationId: string): Promise<BureauReport> {
  if (!isSupabaseConfigured) return mockBureauReport;

  const { data, error } = await supabase
    .from("bureau_reports")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error("Failed to fetch bureau report:", error);
    return mockBureauReport;
  }

  return {
    score: Number(data.score) || 0,
    activeAccounts: Number(data.active_accounts) || 0,
    closedAccounts: Number(data.closed_accounts) || 0,
    totalExposure: Number(data.total_exposure) || 0,
    overdueAccounts: Number(data.overdue_accounts) || 0,
    writeoffs: Boolean(data.writeoffs),
    settlements: Boolean(data.settlements),
    suitsFiled: Boolean(data.suits_filed),
    oldestAccountAge: String(data.oldest_account_age ?? "—"),
    dpdHistory: Array.isArray(data.dpd_history) ? data.dpd_history : mockBureauReport.dpdHistory,
    enquiries: data.enquiries ?? mockBureauReport.enquiries,
  };
}
```

Run `npx tsc --noEmit`.

### 2. Add Bureau tab to `src/routes/applications/$id/index.tsx`

Import the component and API function:

```typescript
import { BureauReport } from "@/components/bureau-report";
import { getBureauReport } from "@/lib/api";
import type { BureauReport as BureauReportType } from "@/lib/mock-data";
```

Add state and fetch:

```typescript
const [bureauData, setBureauData] = useState<BureauReportType | null>(null);

useEffect(() => {
  getBureauReport(id).then(setBureauData);
}, [id]);
```

Add the tab trigger and content inside the existing `<Tabs>`:

```tsx
<TabsTrigger value="bureau">Bureau</TabsTrigger>
```

```tsx
<TabsContent value="bureau">
  {bureauData ? <BureauReport data={bureauData} /> : <Skeleton className="h-64 w-full" />}
</TabsContent>
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `getBureauReport` function, update imports
- `src/routes/applications/$id/index.tsx` — import `BureauReport`, add state/fetch, add Bureau tab

## Done when

- `npx tsc --noEmit` exits clean
- `getBureauReport` returns `mockBureauReport` when Supabase is not configured
- `getBureauReport` queries `bureau_reports` table when Supabase is configured
- Application detail page has four tabs: Overview, Documents, Extracted Data, Bureau
- Bureau tab renders the `BureauReport` component with fetched data
- Loading state shows a `Skeleton` while bureau data is being fetched
- No `// # reason:` or `// Self-review` comments in any edited file
