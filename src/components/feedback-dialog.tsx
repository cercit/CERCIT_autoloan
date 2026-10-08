import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedback, type FeedbackInput } from "@/lib/feedback-api";
import { cn } from "@/lib/utils";

const FIND: { value: NonNullable<FeedbackInput["findability"]>; label: string }[] = [
  { value: "YES", label: "Yes, easily" },
  { value: "MOSTLY", label: "Mostly" },
  { value: "NO", label: "No, I got lost" },
];

/** Asked when someone signs out (086). Skip always works; nothing here is required. */
export function FeedbackDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [experience, setExperience] = useState<number | null>(null);
  const [findability, setFindability] = useState<FeedbackInput["findability"]>(null);
  const [needed, setNeeded] = useState("");
  const [bugs, setBugs] = useState("");
  const [sending, setSending] = useState(false);
  const empty = experience === null && findability === null && !needed.trim() && !bugs.trim();

  async function send() {
    setSending(true);
    try {
      await submitFeedback({ experience, findability, needed, bugs, page: window.location.pathname });
      toast.success("Thank you. Your feedback is saved.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Before you go: how was cercit?</DialogTitle>
          <DialogDescription>Four quick questions. Answer any, or skip.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>1. How was your experience?</Label>
            <div className="flex gap-1" role="radiogroup" aria-label="Experience, 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={experience === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="rounded p-1 focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => setExperience(n)}
                >
                  <Star
                    className={cn("size-7", experience !== null && n <= experience ? "fill-warning text-warning" : "text-muted-foreground")}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>2. Could you find what you were looking for?</Label>
            <div className="grid grid-cols-3 gap-2">
              {FIND.map((f) => (
                <Button
                  key={f.value}
                  type="button"
                  size="sm"
                  variant={findability === f.value ? "default" : "outline"}
                  aria-pressed={findability === f.value}
                  className="h-auto whitespace-normal py-1.5"
                  onClick={() => setFindability(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fb-needed">3. What's missing, and why would it help?</Label>
            <Textarea
              id="fb-needed"
              rows={3}
              maxLength={2000}
              placeholder="e.g. A search box on the case list, so I can find a customer by name"
              value={needed}
              onChange={(e) => setNeeded(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fb-bugs">4. Anything broken? What did you do, and what happened?</Label>
            <Textarea
              id="fb-bugs"
              rows={3}
              maxLength={2000}
              placeholder="e.g. On Rate grid, Save did nothing"
              value={bugs}
              onChange={(e) => setBugs(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Please don't type personal details. Your role is saved with the answers, not your name.</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" disabled={sending} onClick={onDone}>
            Skip and sign out
          </Button>
          <Button type="button" disabled={sending || empty} onClick={() => void send()}>
            {sending ? "Sending..." : "Send and sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
