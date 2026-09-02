# Task 31 — Document upload UI on application detail

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a document upload section to the application detail page where officers can upload files (salary slip, Form 16, bank statement, KYC docs).

## Current state

- `src/routes/applications/$id/index.tsx` renders the application detail
- `src/components/document-list.tsx` exists and shows a read-only document list
- `src/lib/api.ts` has a `Document` type (line ~742)
- shadcn/ui has no file-upload component — use a native `<input type="file">`
- Supabase Storage is available via `supabase.storage` but may not be configured

## Steps

### 1. Add `uploadDocument` function to `src/lib/api.ts`

```typescript
export async function uploadDocument(
  applicationId: string,
  file: File,
  docType: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return new Promise((r) => setTimeout(() => r({ error: null }), 500));
  }
  const path = `${applicationId}/${docType}/${file.name}`;
  const { error } = await supabase.storage
    .from("documents")
    .upload(path, file, { upsert: true });
  if (error) return { error: error.message };
  await supabase.from("documents").insert({
    application_id: applicationId,
    doc_type: docType,
    file_name: file.name,
    file_size: file.size,
    storage_path: path,
  });
  return { error: null };
}
```

### 2. Create `src/components/document-upload.tsx`

Build a component that:
- Takes `applicationId: string` as a prop
- Has a `<select>` for document type: "salary_slip", "form_16", "bank_statement", "pan_card", "aadhaar", "other"
- Has a file input (`accept=".pdf,.jpg,.jpeg,.png"`)
- Has an "Upload" button that calls `uploadDocument`
- Shows toast on success/error (use `toast` from `sonner`)
- Calls an `onUpload` callback prop after successful upload

### 3. Add `<DocumentUpload>` to application detail page

In `src/routes/applications/$id/index.tsx`, import and render `<DocumentUpload>` below the existing document list. Pass `applicationId={app.id}`.

## Files to edit

- `src/lib/api.ts` — add `uploadDocument`
- `src/components/document-upload.tsx` — new file
- `src/routes/applications/$id/index.tsx` — import and render upload component

## Done when

- `npx tsc --noEmit` exits clean
- Upload component renders with doc type selector + file input + upload button
- `uploadDocument` has mock-data fallback (returns success after delay)
- Toast shows on upload success/error
- No `// # reason:` or `// Self-review` comments in any edited file
