import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { overrideDecision } from "@/lib/api";
import { toast } from "sonner";

export function OverridePanel({
  applicationId,
  onOverride,
}: {
  applicationId: string;
  onOverride: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | "MAYBE">("APPROVE");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const { error } = await overrideDecision({ applicationId, decision, reason });
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Override submitted");
      setOpen(false);
      setReason("");
      onOverride();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Override Decision</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override decision</DialogTitle>
          <DialogDescription>
            Change the system decision for this application. A mandatory reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="APPROVE">Approve</SelectItem>
              <SelectItem value="REJECT">Reject</SelectItem>
              <SelectItem value="MAYBE">Refer for review</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Reason for override (min 20 characters)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={reason.length < 20 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting..." : "Submit override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
