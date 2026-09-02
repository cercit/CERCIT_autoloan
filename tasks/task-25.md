# Task 25 — Application officer notes

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add an "Officer Notes" section to the application detail page. Credit officers can add timestamped internal notes to a file.

## Current state

- `src/routes/applications/$id/index.tsx` renders `<CopilotReview app={app} />` then `<DocumentList applicationId={app.id} />`
- No notes component exists
- The `audit_events` table can store notes as events (columns: `event_id`, `application_id` via `entity_id`, `event_type`, `event_detail` JSONB, `actor_type`, `created_at`)
- `src/lib/api.ts` has `formatDate()` (not exported — check if it's available, otherwise use `new Date(ts).toLocaleString()`)

## Steps

### 1. Add API functions to `src/lib/api.ts`

Add these two functions and the type export at the bottom of the file:

```typescript
export type ApplicationNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

export async function getApplicationNotes(applicationId: string): Promise<ApplicationNote[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("audit_events")
    .select("event_id, event_detail, actor_type, created_at")
    .eq("entity_type", "APPLICATION")
    .eq("entity_id", applicationId)
    .eq("event_type", "OFFICER_NOTE")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    id: row.event_id,
    text: (row.event_detail as any)?.note ?? "",
    author: row.actor_type === "SYSTEM" ? "System" : "Officer",
    createdAt: new Date(row.created_at).toLocaleString("en-IN"),
  }));
}

export async function addApplicationNote(applicationId: string, note: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabase.from("audit_events").insert({
    entity_type: "APPLICATION",
    entity_id: applicationId,
    event_type: "OFFICER_NOTE",
    actor_type: "USER",
    event_detail: { note },
  });
  return !error;
}
```

Run `npx tsc --noEmit` after adding these.

### 2. Create `src/components/officer-notes.tsx`

New file. Component takes `applicationId: string` as prop.

```typescript
import { useState, useEffect } from "react";
import { MessageSquare, Send } from "lucide-react";
import { SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getApplicationNotes, addApplicationNote } from "@/lib/api";
import type { ApplicationNote } from "@/lib/api";

export function OfficerNotes({ applicationId }: { applicationId: string }) {
  const [notes, setNotes] = useState<ApplicationNote[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getApplicationNotes(applicationId).then((list) => {
      setNotes(list);
      setLoading(false);
    });
  }, [applicationId]);

  async function handleAdd() {
    if (!text.trim()) return;
    setSubmitting(true);
    const ok = await addApplicationNote(applicationId, text.trim());
    if (ok) {
      const updated = await getApplicationNotes(applicationId);
      setNotes(updated);
      setText("");
    }
    setSubmitting(false);
  }

  return (
    <SectionCard title="Officer Notes" description={`${notes.length} note${notes.length !== 1 ? "s" : ""}`}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a note..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[60px]"
          />
          <Button onClick={handleAdd} disabled={submitting || !text.trim()} size="icon" className="shrink-0">
            <Send className="size-4" />
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="flex gap-2 text-sm">
                <MessageSquare className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                <div>
                  <p>{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.author} · {n.createdAt}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
```

Run `npx tsc --noEmit` after creating this file.

### 3. Add OfficerNotes to application detail page

In `src/routes/applications/$id/index.tsx`, import and render below DocumentList:

```typescript
import { OfficerNotes } from "@/components/officer-notes";
```

In the JSX, after `<DocumentList applicationId={app.id} />`:

```tsx
<OfficerNotes applicationId={app.id} />
```

Run `npx tsc --noEmit` after this change.

## Files to edit

- `src/lib/api.ts` — add type + two functions
- `src/components/officer-notes.tsx` — new file
- `src/routes/applications/$id/index.tsx` — import + render

## Done when

- `npx tsc --noEmit` exits clean
- `getApplicationNotes()` and `addApplicationNote()` exist in api.ts with `isSupabaseConfigured` guards
- `OfficerNotes` component renders below `DocumentList` on the application detail page
- No `// # reason:` or `// Self-review` comments in any edited file
