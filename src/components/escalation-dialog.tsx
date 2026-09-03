import { AlertTriangle } from "lucide-react";
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
import { escalateApplication } from "@/lib/api";
import type { EscalationPayload } from "@/lib/api";
import { toast } from "sonner";

const reasons: { value: EscalationPayload["reason"]; label: string }[] = [
  { value: "HIGH_EXPOSURE", label: "High exposure" },
  { value: "POLICY_EXCEPTION", label: "Policy exception" },
  { value: "FRAUD_SUSPICION", label: "Fraud suspicion" },
  { value: "INCOMPLETE_DOCS", label: "Incomplete documents" },
  { value: "OTHER", label: "Other" },
];

export function EscalationDialog({
  applicationId,
  onEscalate,
}: {
  applicationId: string;
  onEscalate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<EscalationPayload["reason"]>("HIGH_EXPOSURE");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const { error } = await escalateApplication({
      applicationId,
      reason,
      notes,
      escalatedBy: "current-user",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Application escalated");
      setOpen(false);
      setNotes("");
      onEscalate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <AlertTriangle className="size-4" /> Escalate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalate application</DialogTitle>
          <DialogDescription>
            Send this application to a senior reviewer for further assessment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Additional notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Escalating..." : "Escalate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
