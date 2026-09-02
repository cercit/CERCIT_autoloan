# Task 19 — Add document upload section to application detail

## Goal
Add a "Documents" section to the application detail page where uploaded documents (ID proof, income proof, vehicle invoice) are listed and new files can be uploaded via Supabase Storage.

## Current state
- Application detail page (`src/routes/applications/$id/index.tsx`) shows CopilotReview but no document section
- The `documents` table exists in the DB schema (from 001_schema.sql) with columns: `document_id`, `application_id`, `document_type`, `file_name`, `storage_path`, `uploaded_by`, `created_at`
- Supabase Storage is not configured yet, but we can build the UI and API layer with a fallback

## What to do

### 1. Add document API functions to `src/lib/api.ts`

```typescript
export type Document = {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  url: string;
};

export async function getDocuments(applicationId: string): Promise<Document[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("documents")
    .select("document_id, document_type, file_name, storage_path, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((d: any) => ({
    id: d.document_id,
    type: d.document_type ?? "OTHER",
    fileName: d.file_name ?? "Unknown",
    uploadedAt: formatDate(d.created_at ?? ""),
    url: d.storage_path ?? "",
  }));
}

export async function uploadDocument(
  applicationId: string,
  file: File,
  documentType: string
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const path = `applications/${applicationId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file);
  if (uploadError) {
    console.error("Upload failed:", uploadError);
    return false;
  }
  const { error: dbError } = await supabase.from("documents").insert({
    application_id: applicationId,
    document_type: documentType,
    file_name: file.name,
    storage_path: path,
  });
  if (dbError) {
    console.error("Document record failed:", dbError);
    return false;
  }
  return true;
}
```

### 2. Create `src/components/document-list.tsx`
A simple component that:
- Takes `applicationId: string` as prop
- Fetches documents on mount using `getDocuments()`
- Renders a list: file name, document type badge, upload date
- Has an "Upload" button that opens a file input
- On file selection, calls `uploadDocument()` with the selected file and a document type dropdown (options: ID_PROOF, ADDRESS_PROOF, INCOME_PROOF, VEHICLE_INVOICE, INSURANCE, OTHER)
- Shows "No documents uploaded" when the list is empty
- Uses SectionCard from app-shell for layout

### 3. Add DocumentList to application detail
In `src/routes/applications/$id/index.tsx`, add `<DocumentList applicationId={app.id} />` below the CopilotReview component.

## Files to edit
- `src/lib/api.ts` — add `getDocuments()` and `uploadDocument()`
- `src/components/document-list.tsx` — new file
- `src/routes/applications/$id/index.tsx` — add DocumentList

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
