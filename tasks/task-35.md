# Task 35 — Add extraction results tab to application detail

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a tabbed layout to the application detail page using shadcn Tabs. Tab 1: "Overview" (existing `CopilotReview` content), Tab 2: "Documents" (existing `DocumentList` + `OfficerNotes`), Tab 3: "Extracted Data" (`ExtractionResult` component from task 34). Reorganize without losing any existing functionality.

## Current state

- `src/routes/applications/$id/index.tsx` renders `CopilotReview`, `DocumentList`, and `OfficerNotes` sequentially (lines 70-73)
- `src/components/ui/tabs.tsx` exists (shadcn Tabs component)
- `src/components/extraction-result.tsx` exports `ExtractionResult` (from task 34)
- The page already has `app` state, `id` param, and loading skeleton

## Steps

### 1. Add imports to `src/routes/applications/$id/index.tsx`

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExtractionResult } from "@/components/extraction-result";
```

### 2. Wrap existing content in Tabs

Replace the current content inside `<AppShell>` (after the header/actions part) with:

```tsx
<Tabs defaultValue="overview" className="space-y-4">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="documents">Documents</TabsTrigger>
    <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
  </TabsList>

  <TabsContent value="overview">
    <CopilotReview app={app} />
  </TabsContent>

  <TabsContent value="documents" className="space-y-4">
    <DocumentList applicationId={app.id} />
    <OfficerNotes applicationId={app.id} />
  </TabsContent>

  <TabsContent value="extracted">
    <ExtractionResult />
  </TabsContent>
</Tabs>
```

The `CopilotReview` component stays exactly as-is in the Overview tab. The `DocumentList` and `OfficerNotes` move to the Documents tab. The new `ExtractionResult` goes in the Extracted Data tab.

Run `npx tsc --noEmit`.

## Files to edit

- `src/routes/applications/$id/index.tsx` — import Tabs + ExtractionResult, wrap content in tabbed layout

## Done when

- `npx tsc --noEmit` exits clean
- Application detail page shows three tabs: "Overview", "Documents", "Extracted Data"
- "Overview" tab renders `CopilotReview` (all existing copilot functionality preserved)
- "Documents" tab renders `DocumentList` and `OfficerNotes`
- "Extracted Data" tab renders `ExtractionResult`
- Default active tab is "Overview"
- No existing functionality lost — all components receive the same props as before
- No `// # reason:` or `// Self-review` comments in any edited file
