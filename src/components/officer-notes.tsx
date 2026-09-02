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
