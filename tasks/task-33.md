# Task 33 — Document preview panel

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

When an officer clicks a document in the list, show a preview panel using a Dialog. For PDFs, use an iframe; for images, use an img tag. Add a `getDocumentUrl(path)` function to api.ts that returns a signed URL from Supabase Storage (mock fallback returns a placeholder). Create `src/components/document-preview.tsx` with the Dialog. Wire the onClick in `document-list.tsx`.

## Current state

- `src/components/document-list.tsx` renders a list of `Document` items (each has `id`, `type`, `fileName`, `uploadedAt`, `url`)
- `src/lib/api.ts` exports `Document` type with a `url` field (the storage path)
- `src/lib/supabase.ts` exports `supabase` and `isSupabaseConfigured`
- shadcn `Dialog` component exists at `src/components/ui/dialog.tsx`
- No preview functionality exists yet — clicking a document does nothing

## Steps

### 1. Add `getDocumentUrl` to `src/lib/api.ts`

```typescript
export async function getDocumentUrl(path: string): Promise<string> {
  if (!isSupabaseConfigured || !path) {
    return "https://placehold.co/600x800?text=Document+Preview";
  }
  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "https://placehold.co/600x800?text=Preview+Unavailable";
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/document-preview.tsx`

```typescript
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDocumentUrl } from "@/lib/api";

const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

function isImage(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return imageExts.some((ext) => lower.endsWith(ext));
}

export function DocumentPreview({
  open,
  onOpenChange,
  fileName,
  storagePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  storagePath: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUrl(null);
      return;
    }
    getDocumentUrl(storagePath).then(setUrl);
  }, [open, storagePath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center min-h-[400px]">
          {!url ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : isImage(fileName) ? (
            <img src={url} alt={fileName} className="max-w-full max-h-[70vh] rounded" />
          ) : (
            <iframe src={url} title={fileName} className="w-full h-[70vh] rounded border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Run `npx tsc --noEmit`.

### 3. Wire preview into `src/components/document-list.tsx`

Import `DocumentPreview`:

```typescript
import { DocumentPreview } from "@/components/document-preview";
```

Add state for the selected document:

```typescript
const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
```

Make each document list item clickable by wrapping the `<li>` content in a button:

```tsx
<li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
  <button
    type="button"
    className="flex items-center gap-2 min-w-0 text-left hover:underline"
    onClick={() => setPreviewDoc(doc)}
  >
    <FileText className="size-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <p className="text-sm truncate font-medium">{doc.fileName}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">{doc.type}</span>
        <span>&middot;</span>
        <span>{doc.uploadedAt}</span>
      </div>
    </div>
  </button>
</li>
```

Add the `DocumentPreview` component at the end of the return JSX:

```tsx
<DocumentPreview
  open={previewDoc !== null}
  onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
  fileName={previewDoc?.fileName ?? ""}
  storagePath={previewDoc?.url ?? ""}
/>
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `getDocumentUrl`
- `src/components/document-preview.tsx` — new file
- `src/components/document-list.tsx` — add click handler and render `DocumentPreview`

## Done when

- `npx tsc --noEmit` exits clean
- `getDocumentUrl` returns a placeholder URL when Supabase is not configured
- `getDocumentUrl` calls `createSignedUrl` when Supabase is configured
- `DocumentPreview` renders a `Dialog` with an iframe for PDFs and an img for images
- Clicking a document in the list opens the preview dialog
- Closing the dialog clears the selection
- No `// # reason:` or `// Self-review` comments in any edited file
