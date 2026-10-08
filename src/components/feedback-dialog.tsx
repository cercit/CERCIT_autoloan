import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_LABEL, submitFeedback, type Findability, type Profile } from "@/lib/feedback-api";
import { cn } from "@/lib/utils";

const FIND: { value: Findability; label: string }[] = [
  { value: "YES", label: "Yes, easily" },
  { value: "MOSTLY", label: "Mostly" },
  { value: "NO", label: "No, I got lost" },
];
const STAR_WORDS = ["", "Poor", "Not great", "Okay", "Good", "Excellent"];

function Choice({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "default" : "outline"}
      aria-pressed={on}
      className="h-auto whitespace-normal py-1.5 text-left sm:text-center"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Asked when someone signs out (086, 087). Skip always works; nothing here is required. */
export function FeedbackDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [experience, setExperience] = useState<number | null>(null);
  const [findability, setFindability] = useState<Findability | null>(null);
  const [lostWhere, setLostWhere] = useState("");
  const [needed, setNeeded] = useState("");
  const [bugs, setBugs] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [sending, setSending] = useState(false);

  const answered = experience !== null || findability !== null || !!needed.trim() || !!bugs.trim() || !!lostWhere.trim();
  const contactNeedsTick = !!contact.trim() && !contactOk;

  async function send() {
    setSending(true);
    try {
      await submitFeedback({
        profile,
        experience,
        findability,
        lost_where: findability && findability !== "YES" ? lostWhere : "",
        needed,
        bugs,
        name: contact.trim() ? name : "",
        contact,
        contact_ok: contactOk,
        page: window.location.pathname,
      });
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
          <DialogDescription>A minute at most. Answer what you like, or skip.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Which best describes you?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(PROFILE_LABEL) as Profile[]).map((k) => (
                <Choice key={k} on={profile === k} onClick={() => setProfile(profile === k ? null : k)}>
                  {PROFILE_LABEL[k]}
                </Choice>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>1. How was your experience?</Label>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Experience, 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={experience === n}
                  aria-label={`${n} of 5: ${STAR_WORDS[n]}`}
                  className="rounded p-1 focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => setExperience(n)}
                >
                  <Star className={cn("size-7", experience !== null && n <= experience ? "fill-warning text-warning" : "text-muted-foreground")} />
                </button>
              ))}
              {experience !== null && <span className="ml-2 text-sm text-muted-foreground">{STAR_WORDS[experience]}</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>2. Could you find what you were looking for?</Label>
            <div className="grid grid-cols-3 gap-2">
              {FIND.map((f) => (
                <Choice key={f.value} on={findability === f.value} onClick={() => setFindability(f.value)}>
                  {f.label}
                </Choice>
              ))}
            </div>
            {findability && findability !== "YES" && (
              <Textarea
                id="fb-lost"
                rows={2}
                maxLength={1000}
                aria-label="What couldn't you find?"
                placeholder="What couldn't you find? e.g. where to approve a rate change"
                value={lostWhere}
                onChange={(e) => setLostWhere(e.target.value)}
              />
            )}
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

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Want a reply? (optional)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input id="fb-name" maxLength={100} placeholder="Your name" aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                id="fb-contact"
                maxLength={200}
                placeholder="Email or LinkedIn link"
                aria-label="Email or LinkedIn link"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <label htmlFor="fb-ok" className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox id="fb-ok" checked={contactOk} onCheckedChange={(v) => setContactOk(v === true)} className="mt-0.5" />
              <span>You can contact me about this feedback. My details are used only for that, and deleted if I ask.</span>
            </label>
            {contactNeedsTick && <p className="text-xs text-destructive">Tick the box to let us reply, or leave the contact empty.</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" disabled={sending} onClick={onDone}>
            Skip and sign out
          </Button>
          <Button type="button" disabled={sending || !answered || contactNeedsTick} onClick={() => void send()}>
            {sending ? "Sending..." : "Send and sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
