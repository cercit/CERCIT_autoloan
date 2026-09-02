# Task 32 — Document list refresh after upload

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

After a document is uploaded, the document list should refresh to show the new file. The `getDocuments` and `uploadDocument` functions already exist in `api.ts` (lines ~750-799), and `document-list.tsx` already calls both and refreshes the list after upload (lines 50-56). This task verifies the wiring is complete and adds a `refreshKey` prop so parent components can externally trigger a refetch (e.g. if another component on the page triggers an upload).

## Current state

- `src/lib/api.ts` already exports `getDocuments(applicationId)` (line ~750) — fetches from Supabase `documents` table with empty-array fallback when Supabase is not configured
- `src/lib/api.ts` already exports `uploadDocument(applicationId, file, documentType)` (line ~770)
- `src/components/document-list.tsx` already uses `useState` + `useEffect` to fetch documents and refreshes after upload by re-calling `getDocuments` (line 55)
- The `useEffect` dependency array only includes `[applicationId]` — it does not re-run when an external event triggers a refresh

## Steps

### 1. Add `refreshKey` prop to `DocumentList`

In `src/components/document-list.tsx`, change the component signature to accept an optional `refreshKey`:

```typescript
export function DocumentList({
  applicationId,
  refreshKey = 0,
}: {
  applicationId: string;
  refreshKey?: number;
}) {
```

Add `refreshKey` to the `useEffect` dependency array that fetches documents:

```typescript
useEffect(() => {
  getDocuments(applicationId).then((list) => {
    setDocs(list);
    setLoading(false);
  });
}, [applicationId, refreshKey]);
```

### 2. Wire `refreshKey` in the application detail page

In `src/routes/applications/$id/index.tsx`, add a `refreshKey` state variable:

```typescript
const [docRefreshKey, setDocRefreshKey] = useState(0);
```

Pass it to `DocumentList`:

```tsx
<DocumentList applicationId={app.id} refreshKey={docRefreshKey} />
```

This allows future components (e.g. a separate upload widget) to call `setDocRefreshKey((k) => k + 1)` to trigger a refetch.

Run `npx tsc --noEmit` after each file change.

## Files to edit

- `src/components/document-list.tsx` — add `refreshKey` prop and dependency
- `src/routes/applications/$id/index.tsx` — add `docRefreshKey` state, pass to `DocumentList`

## Done when

- `npx tsc --noEmit` exits clean
- `DocumentList` accepts an optional `refreshKey` prop
- The `useEffect` that fetches documents includes `refreshKey` in its dependency array
- The application detail page passes `refreshKey={docRefreshKey}` to `DocumentList`
- Incrementing `docRefreshKey` causes the document list to refetch
- No `// # reason:` or `// Self-review` comments in any edited file
