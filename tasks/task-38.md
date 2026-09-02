# Task 38 — Document status badges

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Each document in the document list should show a status badge: "Uploaded" (muted), "Extracted" (primary), "Verified" (success), "Failed" (destructive). Add a `doc_status` field to the `Document` type, update `getDocuments` to include the status, and render it using the `Pill` component from `status.tsx`.

## Current state

- `src/lib/api.ts` defines `Document` type (line ~742) with fields: `id`, `type`, `fileName`, `uploadedAt`, `url` — no status field
- `src/lib/api.ts` `getDocuments` (line ~750) queries the `documents` table but does not select or map a status column
- `src/components/document-list.tsx` renders each doc in a `<li>` with file name, type, and upload date — no status badge
- `src/components/status.tsx` exports `Pill` with tone support

## Steps

### 1. Update `Document` type in `src/lib/api.ts`

Add `status` to the type:

```typescript
export type Document = {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  url: string;
  status: "Uploaded" | "Extracted" | "Verified" | "Failed";
};
```

### 2. Update `getDocuments` in `src/lib/api.ts`

Update the Supabase select to include `upload_status`:

```typescript
.select("id, doc_type, file_name, file_path, uploaded_at, created_at, upload_status")
```

Update the mapping to include status:

```typescript
return (data as any[]).map((d: any) => ({
  id: d.id ?? "",
  type: d.doc_type ?? "OTHER",
  fileName: d.file_name ?? "Unknown",
  uploadedAt: formatDate(d.uploaded_at ?? d.created_at ?? ""),
  url: d.file_path ?? "",
  status: mapDocStatus(d.upload_status),
}));
```

Add a helper function above `getDocuments`:

```typescript
function mapDocStatus(raw: string | null): Document["status"] {
  const map: Record<string, Document["status"]> = {
    UPLOADED: "Uploaded",
    EXTRACTED: "Extracted",
    VERIFIED: "Verified",
    FAILED: "Failed",
  };
  return map[raw ?? ""] ?? "Uploaded";
}
```

Also update the mock fallback in `getDocuments` to return empty array (which already returns `[]`, so the status field is satisfied — no docs means no type conflict).

Run `npx tsc --noEmit`.

### 3. Add status badge to `src/components/document-list.tsx`

Import `Pill` from status:

```typescript
import { Pill } from "@/components/status";
```

Define the tone mapping:

```typescript
const docStatusTone = {
  Uploaded: "muted",
  Extracted: "primary",
  Verified: "success",
  Failed: "destructive",
} as const;
```

In each `<li>`, add the `Pill` after the doc info:

```tsx
<Pill tone={docStatusTone[doc.status]}>{doc.status}</Pill>
```

Place it on the right side of the list item, after the existing file info and before the closing `</li>`.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `status` to `Document` type, update `getDocuments` select and mapping, add `mapDocStatus`
- `src/components/document-list.tsx` — import `Pill`, add status badge to each document row

## Done when

- `npx tsc --noEmit` exits clean
- `Document` type includes `status: "Uploaded" | "Extracted" | "Verified" | "Failed"`
- `getDocuments` maps `upload_status` from the database to the four display statuses
- Each document row shows a colored `Pill` badge: muted for Uploaded, primary for Extracted, success for Verified, destructive for Failed
- Mock fallback still works (empty array has no type conflict)
- No `// # reason:` or `// Self-review` comments in any edited file
