import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ReviewWorkspaceProps {
  applicationId: string;
  applicantName: string;
  metrics: {
    bureauScore: number;
    foirPercent: number;
    ltvPercent: number;
    riskGrade: string;
  };
  policyFlags: { name: string; severity: "hard" | "soft" }[];
  documentChecklist: { name: string; status: string }[];
  onApprove?: () => void;
  onDecline?: (reason?: string) => void;
  onRequestInfo?: (message: string) => void;
  className?: string;
}

export function ManualReviewWorkspace({ applicationId, applicantName, metrics, policyFlags, documentChecklist, onApprove, onDecline, onRequestInfo, className }: ReviewWorkspaceProps) {
  const [notes, setNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");

  return (
    <div className={cn("panel", className)}>
      <header className="mb-4">
        <h2 className="text-base font-bold">Manual Review — {applicantName}</h2>
        <p className="text-xs text-muted-foreground">App ID: {applicationId}</p>
      </header>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {([
          { label: "Bureau Score", value: metrics.bureauScore, color: metrics.bureauScore >= 700 ? "text-green-600" : metrics.bureauScore >= 650 ? "text-amber-600" : "text-red-600" },
          { label: "FOIR %", value: `${metrics.foirPercent.toFixed(1)}%`, color: metrics.foirPercent <= 40 ? "text-green-600" : metrics.foirPercent <= 50 ? "text-amber-600" : "text-red-600" },
          { label: "LTV %", value: `${metrics.ltvPercent.toFixed(1)}%`, color: metrics.ltvPercent <= 80 ? "text-green-600" : metrics.ltvPercent <= 85 ? "text-amber-600" : "text-red-600" },
          { label: "Grade", value: metrics.riskGrade, color: metrics.riskGrade === "A" ? "text-green-600" : metrics.riskGrade === "B" ? "text-amber-600" : metrics.riskGrade === "D" ? "text-red-600" : "text-red-800" },
        ] as const).map((m) => (
          <div key={m.label} className="rounded-md border bg-muted/20 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
            <p className={cn("text-lg font-extrabold", m.color)}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Policy Flags</h4>
          {policyFlags.length === 0 ? <p className="text-xs text-muted-foreground">No policy failures</p> : policyFlags.map((f) => (
            <div key={f.name} className="flex items-center gap-2 text-xs mb-1">
              <span className={cn("w-2 h-2 rounded-full", f.severity === "hard" ? "bg-red-500" : "bg-amber-400")} />
              <span className={cn("font-medium", f.severity === "hard" ? "text-red-700" : "text-amber-700")}>{f.name}</span>
              <span className="text-muted-foreground">({f.severity})</span>
            </div>
          ))}
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Document Checklist</h4>
          {documentChecklist.map((d) => {
            const icon = d.status === "verified" ? "✓" : d.status === "extracted" ? "●" : d.status === "uploaded" ? "○" : "✗";
            const color = d.status === "verified" ? "text-green-600" : d.status === "extracted" ? "text-blue-500" : d.status === "uploaded" ? "text-amber-500" : "text-red-600";
            return (
              <div key={d.name} className="flex items-center gap-2 text-xs mb-1">
                <span className={cn("font-bold w-3 text-center", color)}>{icon}</span>
                <span>{d.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="reviewNotes" className="text-xs font-medium text-muted-foreground block mb-1">Reviewer notes</label>
        <textarea id="reviewNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Add assessment comments..." />
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={onApprove} className="rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">Approve</button>
        <button onClick={() => setShowDecline(!showDecline)} className="rounded-md bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">Decline</button>
        <button onClick={() => setShowInfo(!showInfo)} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">Request info</button>
      </div>

      {showDecline && (
        <div className="mt-3 rounded-md border bg-red-50 p-3 space-y-2">
          <label htmlFor="declineReason" className="text-xs font-medium text-red-800">Reason for decline</label>
          <textarea id="declineReason" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={2} className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Required explanation..." />
          <button onClick={() => onDecline?.(declineReason)} disabled={!declineReason.trim()} className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">Confirm decline</button>
        </div>
      )}

      {showInfo && (
        <div className="mt-3 rounded-md border bg-blue-50 p-3 space-y-2">
          <label htmlFor="infoMsg" className="text-xs font-medium text-blue-800">Additional info needed</label>
          <textarea id="infoMsg" value={infoMsg} onChange={(e) => setInfoMsg(e.target.value)} rows={2} className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="Specify what additional info is required..." />
          <button onClick={() => { onRequestInfo?.(infoMsg); }} disabled={!infoMsg.trim()} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">Send request</button>
        </div>
      )}
    </div>
  );
}
